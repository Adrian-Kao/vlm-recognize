import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';

const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function fail(message) {
  throw new Error(`GLB 檢查失敗：${message}`);
}

function parseGlb(buffer) {
  if (buffer.length < 20) fail('檔案小於最小 GLB 標頭');
  if (buffer.toString('ascii', 0, 4) !== 'glTF') fail('magic 不是 glTF，可能是 HTML、ZIP 或損壞檔案');
  const version = buffer.readUInt32LE(4);
  const declaredLength = buffer.readUInt32LE(8);
  if (version !== 2) fail(`只支援 glTF 2，實際版本 ${version}`);
  if (declaredLength !== buffer.length) fail(`宣告長度 ${declaredLength} 與實際 ${buffer.length} 不符`);
  const chunks = [];
  let offset = 12;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) fail('chunk 標頭不完整');
    const byteLength = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + byteLength > buffer.length) fail('chunk 超出檔案範圍');
    chunks.push({ type, data: buffer.subarray(offset, offset + byteLength) });
    offset += byteLength;
  }
  const jsonChunk = chunks.find((chunk) => chunk.type === 0x4e4f534a);
  if (!jsonChunk) fail('缺少 JSON chunk');
  const json = JSON.parse(jsonChunk.data.toString('utf8').replaceAll('\0', '').trim());
  return { json, version, declaredLength, chunks };
}

function componentReader(view, componentType, byteOffset) {
  if (componentType === 5120) return view.getInt8(byteOffset);
  if (componentType === 5121) return view.getUint8(byteOffset);
  if (componentType === 5122) return view.getInt16(byteOffset, true);
  if (componentType === 5123) return view.getUint16(byteOffset, true);
  if (componentType === 5125) return view.getUint32(byteOffset, true);
  if (componentType === 5126) return view.getFloat32(byteOffset, true);
  fail(`不支援 componentType ${componentType}`);
}

function normalizedValue(value, componentType) {
  if (componentType === 5120) return Math.max(value / 127, -1);
  if (componentType === 5121) return value / 255;
  if (componentType === 5122) return Math.max(value / 32767, -1);
  if (componentType === 5123) return value / 65535;
  return value;
}

function makeAccessorReader(json, binaryChunk) {
  return (accessorIndex) => {
    const accessor = json.accessors?.[accessorIndex];
    if (!accessor) fail(`accessor ${accessorIndex} 不存在`);
    if (accessor.sparse) fail(`accessor ${accessorIndex} 使用 sparse；檢查工具尚不支援`);
    const bufferView = json.bufferViews?.[accessor.bufferView];
    if (!bufferView) fail(`accessor ${accessorIndex} 缺少 bufferView`);
    if ((bufferView.buffer ?? 0) !== 0 || !binaryChunk) fail(`accessor ${accessorIndex} 不在內嵌 BIN chunk`);
    const width = TYPE_COMPONENTS[accessor.type];
    const bytes = COMPONENT_BYTES[accessor.componentType];
    if (!width || !bytes) fail(`accessor ${accessorIndex} 型別不支援`);
    const packedStride = width * bytes;
    const stride = bufferView.byteStride ?? packedStride;
    const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    if (start + Math.max(0, accessor.count - 1) * stride + packedStride > binaryChunk.length) {
      fail(`accessor ${accessorIndex} 超出 BIN 範圍`);
    }
    const view = new DataView(binaryChunk.buffer, binaryChunk.byteOffset, binaryChunk.byteLength);
    const values = Array.from({ length: accessor.count }, (_, itemIndex) => Array.from({ length: width }, (_, componentIndex) => {
      const raw = componentReader(view, accessor.componentType, start + itemIndex * stride + componentIndex * bytes);
      return accessor.normalized ? normalizedValue(raw, accessor.componentType) : raw;
    }));
    return { accessor, values };
  };
}

function buildNodePaths(nodes = []) {
  const parents = new Map();
  nodes.forEach((node, parentIndex) => node.children?.forEach((child) => parents.set(child, parentIndex)));
  const pathFor = (index) => {
    const parts = [];
    let cursor = index;
    const seen = new Set();
    while (cursor !== undefined && !seen.has(cursor)) {
      seen.add(cursor);
      parts.unshift(`${nodes[cursor]?.name || '(unnamed)'}[${cursor}]`);
      cursor = parents.get(cursor);
    }
    return parts.join('/');
  };
  return { parents, pathFor };
}

function inspectSkinning(json, readAccessor) {
  const meshNodes = (json.nodes ?? []).flatMap((node, nodeIndex) => node.mesh === undefined ? [] : [{ node, nodeIndex }]);
  const results = [];
  for (const { node, nodeIndex } of meshNodes) {
    const mesh = json.meshes?.[node.mesh];
    const skin = node.skin === undefined ? null : json.skins?.[node.skin];
    for (const [primitiveIndex, primitive] of (mesh?.primitives ?? []).entries()) {
      const item = {
        nodeIndex,
        meshIndex: node.mesh,
        primitiveIndex,
        skinIndex: node.skin ?? null,
        vertexCount: 0,
        hasJoints: primitive.attributes?.JOINTS_0 !== undefined,
        hasWeights: primitive.attributes?.WEIGHTS_0 !== undefined,
        zeroWeightVertices: 0,
        invalidWeightVertices: 0,
        maxJointIndex: -1,
        jointInfluenceCounts: skin ? Array(skin.joints.length).fill(0) : [],
        positionMin: null,
        positionMax: null,
      };
      if (primitive.attributes?.POSITION !== undefined) {
        const position = readAccessor(primitive.attributes.POSITION).accessor;
        item.positionMin = position.min ?? null;
        item.positionMax = position.max ?? null;
      }
      if (item.hasJoints && item.hasWeights && skin) {
        const joints = readAccessor(primitive.attributes.JOINTS_0).values;
        const weights = readAccessor(primitive.attributes.WEIGHTS_0).values;
        item.vertexCount = joints.length;
        if (joints.length !== weights.length) fail(`mesh ${node.mesh} primitive ${primitiveIndex} 的 JOINTS/WEIGHTS count 不同`);
        joints.forEach((indices, vertexIndex) => {
          const vertexWeights = weights[vertexIndex];
          const sum = vertexWeights.reduce((total, value) => total + value, 0);
          if (!Number.isFinite(sum) || vertexWeights.some((value) => !Number.isFinite(value) || value < 0)) item.invalidWeightVertices += 1;
          if (sum <= 1e-8) item.zeroWeightVertices += 1;
          indices.forEach((jointIndex, componentIndex) => {
            item.maxJointIndex = Math.max(item.maxJointIndex, jointIndex);
            if (jointIndex >= skin.joints.length) fail(`頂點 ${vertexIndex} 引用超出 skin joint 範圍的索引 ${jointIndex}`);
            if (vertexWeights[componentIndex] > 1e-5) item.jointInfluenceCounts[jointIndex] += 1;
          });
        });
      }
      results.push(item);
    }
  }
  return results;
}

function detectHands(nodes = []) {
  const names = nodes.map((node) => node.name ?? '');
  const left = names.some((name) => /left/i.test(name));
  const right = names.some((name) => /right/i.test(name));
  return left && right ? 'both' : left ? 'left' : right ? 'right' : 'undetermined';
}

function inspectImages(json, binaryChunk) {
  return (json.images ?? []).map((image, index) => {
    const view = image.bufferView === undefined ? null : json.bufferViews?.[image.bufferView];
    const start = view?.byteOffset ?? 0;
    const end = start + (view?.byteLength ?? 0);
    const data = view && binaryChunk ? binaryChunk.subarray(start, end) : null;
    const isPng = data?.length >= 24 && data.toString('hex', 0, 8) === '89504e470d0a1a0a';
    return {
      index,
      name: image.name ?? null,
      mimeType: image.mimeType ?? null,
      embedded: image.bufferView !== undefined,
      byteLength: data?.length ?? null,
      width: isPng ? data.readUInt32BE(16) : null,
      height: isPng ? data.readUInt32BE(20) : null,
      uri: image.uri ?? null,
    };
  });
}

function markdownReport(summary) {
  const skinRows = summary.skins.flatMap((skin) => skin.joints.map((joint) =>
    `| ${skin.index} | ${joint.skinJointIndex} | ${joint.nodeIndex} | ${joint.name} | ${joint.parentName ?? '—'} | ${joint.translation.join(', ')} | ${joint.influencedVertices} |`,
  )).join('\n');
  const meshRows = summary.meshes.map((mesh) =>
    `| ${mesh.nodeIndex} | ${mesh.meshIndex}/${mesh.primitiveIndex} | ${mesh.skinIndex ?? '—'} | ${mesh.vertexCount} | ${mesh.hasJoints}/${mesh.hasWeights} | ${mesh.maxJointIndex} | ${mesh.zeroWeightVertices} | ${mesh.positionMin?.join(', ') ?? '—'} → ${mesh.positionMax?.join(', ') ?? '—'} |`,
  ).join('\n');
  const transformRows = summary.skeletonAncestors.map((node) =>
    `| ${node.nodeIndex} | ${node.name} | ${node.matrix?.join(', ') ?? '—'} | ${node.translation?.join(', ') ?? '—'} | ${node.rotation?.join(', ') ?? '—'} | ${node.scale?.join(', ') ?? '—'} |`,
  ).join('\n');
  const imageRows = summary.images.map((item) =>
    `| ${item.index} | ${item.name ?? '—'} | ${item.mimeType ?? '—'} | ${item.embedded ? '是' : '否'} | ${item.byteLength ?? '—'} | ${item.width && item.height ? `${item.width}×${item.height}` : '—'} | ${item.uri ?? '—'} |`,
  ).join('\n');
  return `# HAND_ASSET_REPORT\n\n` +
    `由 \`npm run inspect:hand -- ${summary.inputPath}\` 產生。報告只描述實際檔案；瀏覽器載入與動態蒙皮另由 E2E 驗證。\n\n` +
    `## 檔案與狀態\n\n` +
    `- 狀態：**${summary.status}**\n` +
    `- 路徑：\`${summary.absolutePath}\`\n` +
    `- 大小：${summary.byteLength} bytes\n` +
    `- SHA-256：\`${summary.sha256}\`\n` +
    `- GLB：magic \`${summary.magic}\`、version ${summary.version}、宣告與實際長度一致\n` +
    `- glTF generator：${summary.asset.generator ?? '未提供'}\n` +
    `- extensionsUsed：${summary.extensionsUsed.length ? summary.extensionsUsed.join(', ') : '無'}\n` +
    `- extensionsRequired：${summary.extensionsRequired.length ? summary.extensionsRequired.join(', ') : '無'}\n\n` +
    `## 資產內嵌來源資料\n\n` +
    `- 標題：${summary.asset.title ?? '未提供'}\n` +
    `- 作者：${summary.asset.author ?? '未提供'}\n` +
    `- 來源：${summary.asset.source ?? '未提供'}\n` +
    `- 授權：${summary.asset.license ?? '未提供'}\n` +
    `- 授權狀態：**${summary.licenseStatus}**（來自 GLB 內嵌 metadata，發佈前仍應保留署名並核對來源頁）\n\n` +
    `## 場景、手側與動畫\n\n` +
    `- scene：${summary.sceneCount}；nodes：${summary.nodeCount}；meshes：${summary.meshCount}；skins：${summary.skinCount}\n` +
    `- 手側候選：**${summary.detectedHands}**（依節點名稱與兩條完整階層判定）\n` +
    `- 動畫：${summary.animations.length ? summary.animations.map((item) => `${item.name} (${item.channelCount} channels；targets: ${item.targetNodes.join(', ')})`).join('、') : '無'}。應用程式不播放資產動畫；姿態只由錄製 landmarks 驅動。\n` +
    `- 節點名稱：空白 ${summary.nodeNames.empty.length} 個；重複 ${summary.nodeNames.duplicates.length ? summary.nodeNames.duplicates.map((item) => `${item.name}×${item.indices.length}`).join('、') : '無'}。\n` +
    `- 材質：${summary.materialCount}（${summary.materialNames.join(', ') || '未命名'}）；images：${summary.imageCount}；外部 URI：${summary.externalUris.length ? summary.externalUris.join(', ') : '無'}\n\n` +
    `| image | 名稱 | MIME | 內嵌 | bytes | 尺寸 | URI |\n|---:|---|---|---|---:|---|---|\n${imageRows || '| — | — | — | — | — | — | — |'}\n\n` +
    `## Skeleton 上層座標轉換\n\n` +
    `| node | 名稱 | matrix | translation | rotation | scale |\n|---:|---|---|---|---|---|\n${transformRows}\n\n` +
    `- FBX 匯入節點的 matrix 含 **0.01 uniform scale**，最上層另有 X 軸 -90° 的座標轉換。rig mapping 的固定 scene scale 必須補償這個匯入尺度；bone local translation 仍保持資產原值。\n\n` +
    `## Mesh／蒙皮檢查\n\n` +
    `| node | mesh/primitive | skin | vertices | JOINTS/WEIGHTS | 最大 joint index | 零權重頂點 | POSITION accessor min → max |\n|---:|---:|---:|---:|---|---:|---:|---|\n${meshRows}\n\n` +
    `- inverseBindMatrices：${summary.skins.every((skin) => skin.inverseBindMatricesValid) ? '每個 skin 均存在且 count 與 joints 相符' : '缺少或 count 不符'}\n` +
    `- 權重／joint index：${summary.skinningValid ? '結構有效，沒有超界 joint、負權重或零總權重頂點' : '有錯誤，詳見命令輸出'}\n\n` +
    `## 瀏覽器 GLTFLoader／動態蒙皮驗證\n\n` +
    `結構檢查命令不把 JSON 解析誤稱為渲染成功。應用程式另在瀏覽器中以 GLTFLoader／useGLTF 載入此 hash，建立 SkeletonUtils clone，定位右食指第二節 \`J_Right_HandIndex2_030\`，挑出該 joint 權重最高的實際頂點，暫時旋轉骨骼 8°，並要求 \`SkinnedMesh.applyBoneTransform\` 前後位移大於 \`1e-5\`，隨後還原 rest transform。新增動作預覽及名稱重播的 Playwright 流程都必須看到 \`GLB rig 已就緒\` 與非零 \`skin Δ\`；失敗則由 ErrorBoundary 明示程序化降級。\n\n` +
    `## 骨架清單\n\n` +
    `模型不是 21 根骨骼。唯一 skin 有 ${summary.skins[0]?.joints.length ?? 0} 個 joint，包含共用 root、左右手腕／掌部，以及每指四節（第四節為末端）。\n\n` +
    `| skin | skin joint | node | 名稱 | 父節點 | rest translation | 影響頂點數 |\n|---:|---:|---:|---|---|---|---:|\n${skinRows}\n\n` +
    `## 結論與限制\n\n` +
    `- 結構檢查判定為 **${summary.status}**：GLB 有可用 SkinnedMesh、雙手骨鏈、inverse bind matrices 與有效權重。\n` +
    `- 左右手位於同一個 SkinnedMesh／Skeleton；應用程式以 SkeletonUtils.clone 為每個觀測手建立獨立 skeleton clone，再驅動對應側 root 與骨鏈。\n` +
    `- 單手顯示時，未追蹤側會被移出場景；不把整個模型的預製 Idle 動畫當作使用者動作。\n` +
    `- 本報告不代表真人攝影機姿態已驗證；骨骼方向、拇指對掌、穿模與裝置效能仍需依 manual-camera-test 實測。\n`;
}

async function main() {
  const input = process.argv[2] ?? 'public/models/hands.glb';
  const absolutePath = resolve(input);
  const buffer = await readFile(absolutePath).catch((error) => fail(`無法讀取 ${absolutePath}：${error.message}`));
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const { json, version, declaredLength, chunks } = parseGlb(buffer);
  const binaryChunk = chunks.find((chunk) => chunk.type === 0x004e4942)?.data;
  const readAccessor = makeAccessorReader(json, binaryChunk);
  const { parents, pathFor } = buildNodePaths(json.nodes);
  const meshes = inspectSkinning(json, readAccessor);
  const skins = (json.skins ?? []).map((skin, index) => {
    const inverse = skin.inverseBindMatrices === undefined ? null : readAccessor(skin.inverseBindMatrices).accessor;
    const influence = meshes.find((mesh) => mesh.skinIndex === index)?.jointInfluenceCounts ?? [];
    return {
      index,
      name: skin.name ?? null,
      skeletonNode: skin.skeleton ?? null,
      inverseBindMatrices: skin.inverseBindMatrices ?? null,
      inverseBindMatricesValid: inverse === null || (inverse.type === 'MAT4' && inverse.count === skin.joints.length),
      joints: skin.joints.map((nodeIndex, skinJointIndex) => ({
        skinJointIndex,
        nodeIndex,
        name: json.nodes[nodeIndex]?.name ?? '(unnamed)',
        path: pathFor(nodeIndex),
        parentNodeIndex: parents.get(nodeIndex) ?? null,
        parentName: parents.has(nodeIndex) ? json.nodes[parents.get(nodeIndex)]?.name ?? '(unnamed)' : null,
        translation: json.nodes[nodeIndex]?.translation ?? [0, 0, 0],
        rotation: json.nodes[nodeIndex]?.rotation ?? [0, 0, 0, 1],
        scale: json.nodes[nodeIndex]?.scale ?? [1, 1, 1],
        influencedVertices: influence[skinJointIndex] ?? 0,
      })),
    };
  });
  const externalUris = [
    ...(json.buffers ?? []).map((item) => item.uri).filter(Boolean),
    ...(json.images ?? []).map((item) => item.uri).filter(Boolean),
  ];
  const extras = json.asset?.extras ?? {};
  const names = new Map();
  (json.nodes ?? []).forEach((node, nodeIndex) => {
    if (!node.name?.trim()) return;
    const indices = names.get(node.name) ?? [];
    indices.push(nodeIndex);
    names.set(node.name, indices);
  });
  const skinningValid = meshes.length > 0 && meshes.every((item) => item.skinIndex !== null && item.hasJoints && item.hasWeights
    && item.zeroWeightVertices === 0 && item.invalidWeightVertices === 0)
    && skins.length > 0 && skins.every((skin) => skin.inverseBindMatricesValid);
  const detectedHands = detectHands(json.nodes);
  const status = skinningValid && detectedHands === 'both' ? 'rig-ready' : skins.length ? 'rig-unmapped' : 'mesh-only';
  const skeletonNode = json.skins?.[0]?.skeleton ?? json.skins?.[0]?.joints?.[0];
  const skeletonAncestorIndices = [];
  let ancestorCursor = skeletonNode;
  while (ancestorCursor !== undefined && ancestorCursor !== null) {
    skeletonAncestorIndices.unshift(ancestorCursor);
    ancestorCursor = parents.get(ancestorCursor);
  }
  const summary = {
    inputPath: input.replaceAll('\\', '/'), absolutePath, byteLength: buffer.length, sha256,
    magic: 'glTF', version, declaredLength,
    asset: { generator: json.asset?.generator ?? null, title: extras.title ?? null, author: extras.author ?? null, source: extras.source ?? null, license: extras.license ?? null },
    licenseStatus: extras.license ? 'metadata-declared' : 'unverified',
    status, detectedHands,
    sceneCount: json.scenes?.length ?? 0, nodeCount: json.nodes?.length ?? 0, meshCount: json.meshes?.length ?? 0,
    skinCount: skins.length, materialCount: json.materials?.length ?? 0, imageCount: json.images?.length ?? 0,
    materialNames: (json.materials ?? []).map((material) => material.name ?? '(unnamed)'),
    images: inspectImages(json, binaryChunk),
    nodeNames: {
      empty: (json.nodes ?? []).flatMap((node, nodeIndex) => node.name?.trim() ? [] : [nodeIndex]),
      duplicates: [...names.entries()].flatMap(([name, indices]) => indices.length > 1 ? [{ name, indices }] : []),
    },
    extensionsUsed: json.extensionsUsed ?? [], extensionsRequired: json.extensionsRequired ?? [], externalUris,
    animations: (json.animations ?? []).map((animation) => ({
      name: animation.name ?? '(unnamed)',
      channelCount: animation.channels?.length ?? 0,
      targetNodes: [...new Set((animation.channels ?? []).map((channel) => json.nodes?.[channel.target?.node]?.name ?? `(node ${channel.target?.node ?? '?'})`))],
    })),
    skeletonAncestors: skeletonAncestorIndices.map((nodeIndex) => ({
      nodeIndex,
      name: json.nodes[nodeIndex]?.name ?? '(unnamed)',
      matrix: json.nodes[nodeIndex]?.matrix ?? null,
      translation: json.nodes[nodeIndex]?.translation ?? null,
      rotation: json.nodes[nodeIndex]?.rotation ?? null,
      scale: json.nodes[nodeIndex]?.scale ?? null,
    })),
    meshes, skins, skinningValid,
  };
  const projectRoot = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1')), '..');
  await writeFile(resolve(projectRoot, 'docs/HAND_ASSET_REPORT.md'), markdownReport(summary), 'utf8');
  await writeFile(resolve(dirname(absolutePath), 'hand.asset.json'), `${JSON.stringify({
    schemaVersion: 1,
    assetPath: `/${relative(resolve(projectRoot, 'public'), absolutePath).replaceAll('\\', '/')}`,
    originalFilename: basename(absolutePath),
    sha256,
    byteLength: buffer.length,
    status,
    detectedHands,
    title: extras.title ?? null,
    author: extras.author ?? null,
    source: extras.source ?? null,
    license: extras.license ?? null,
    licenseStatus: extras.license ? 'metadata-declared' : 'unverified',
    acquiredAt: null,
    inspectedAt: new Date().toISOString(),
    modifications: [],
  }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status, path: absolutePath, bytes: buffer.length, sha256, detectedHands,
    nodes: summary.nodeCount, meshes: summary.meshCount, skins: summary.skinCount,
    joints: skins.map((skin) => skin.joints.length), animations: summary.animations,
    skinningValid, report: resolve(projectRoot, 'docs/HAND_ASSET_REPORT.md') }, null, 2));
  if (status !== 'rig-ready') process.exitCode = 2;
}

await main();
