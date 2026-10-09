import * as THREE from 'three';
import type { PlaybackHandPose } from '../types';
import { HAND_RIG_MAP } from './handRigMap';
import { buildCanonicalRigTarget } from './retargetHandPose';
import type { RigBoneRef, RigHandMap } from './rigTypes';

interface RestTransform {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

export interface RigBinding {
  scene: THREE.Object3D;
  bones: Map<string, THREE.Bone>;
  rest: Map<string, RestTransform>;
  skinnedMeshes: THREE.SkinnedMesh[];
  deformationCheck: { boneName: string; vertexIndex: number; weight: number; delta: number };
}

export interface RigBounds {
  center: [number, number, number];
  size: [number, number, number];
  deformationCheck: RigBinding['deformationCheck'];
}

function skinComponent(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, vertex: number, component: number): number {
  if (component === 0) return attribute.getX(vertex);
  if (component === 1) return attribute.getY(vertex);
  if (component === 2) return attribute.getZ(vertex);
  return attribute.getW(vertex);
}

function verifyFingerSkinDeformation(binding: Omit<RigBinding, 'deformationCheck'>): RigBinding['deformationCheck'] {
  const mesh = binding.skinnedMeshes[0];
  const reference = HAND_RIG_MAP.hands.Right.fingers.index.drivenBones[1];
  const bone = binding.bones.get(reference.name)!;
  const jointIndex = mesh.skeleton.bones.indexOf(bone);
  const skinIndex = mesh.geometry.getAttribute('skinIndex');
  const skinWeight = mesh.geometry.getAttribute('skinWeight');
  const position = mesh.geometry.getAttribute('position');
  if (jointIndex < 0 || !skinIndex || !skinWeight || !position) throw new Error('GLB 缺少可驗證的 skin attributes');
  let vertexIndex = -1;
  let weight = -1;
  for (let vertex = 0; vertex < skinIndex.count; vertex += 1) {
    for (let component = 0; component < 4; component += 1) {
      if (skinComponent(skinIndex, vertex, component) === jointIndex) {
        const candidate = skinComponent(skinWeight, vertex, component);
        if (candidate > weight) { vertexIndex = vertex; weight = candidate; }
      }
    }
  }
  if (vertexIndex < 0 || weight <= 0) throw new Error(`骨骼 ${reference.name} 沒有任何頂點權重`);
  const readSkinnedVertex = () => mesh.applyBoneTransform(vertexIndex, new THREE.Vector3().fromBufferAttribute(position, vertexIndex));
  binding.scene.updateWorldMatrix(true, true);
  mesh.skeleton.update();
  const before = readSkinnedVertex();
  const original = bone.quaternion.clone();
  bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(8)));
  binding.scene.updateWorldMatrix(true, true);
  mesh.skeleton.update();
  const delta = readSkinnedVertex().distanceTo(before);
  bone.quaternion.copy(original);
  binding.scene.updateWorldMatrix(true, true);
  mesh.skeleton.update();
  if (!Number.isFinite(delta) || delta <= 1e-5) throw new Error(`骨骼 ${reference.name} 旋轉未帶動蒙皮表面`);
  return { boneName: reference.name, vertexIndex, weight, delta };
}

function allMappedBones(): RigBoneRef[] {
  return Object.values(HAND_RIG_MAP.hands).flatMap((hand) => [
    hand.rootBone,
    hand.palmBone,
    ...Object.values(hand.fingers).flatMap((finger) => [...finger.drivenBones, finger.terminalBone]),
  ]);
}

function findBone(scene: THREE.Object3D, reference: RigBoneRef): THREE.Bone {
  const matches: THREE.Bone[] = [];
  scene.traverse((object) => {
    if ((object as THREE.Bone).isBone && object.name === reference.name) matches.push(object as THREE.Bone);
  });
  if (matches.length !== 1) throw new Error(`骨骼 ${reference.name} 對應到 ${matches.length} 個節點；mapping 已失效`);
  return matches[0];
}

export function createRigBinding(scene: THREE.Object3D): RigBinding {
  const skinnedMeshes: THREE.SkinnedMesh[] = [];
  scene.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) {
      const mesh = object as THREE.SkinnedMesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      skinnedMeshes.push(mesh);
    }
  });
  if (skinnedMeshes.length !== 1 || skinnedMeshes[0].skeleton.bones.length !== 46) {
    throw new Error(`GLB rig 結構不符：預期 1 個 SkinnedMesh／46 joints，實際 ${skinnedMeshes.length}／${skinnedMeshes[0]?.skeleton.bones.length ?? 0}`);
  }
  const bones = new Map<string, THREE.Bone>();
  const rest = new Map<string, RestTransform>();
  for (const reference of allMappedBones()) {
    const bone = findBone(scene, reference);
    bones.set(reference.name, bone);
    rest.set(reference.name, {
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
      scale: bone.scale.clone(),
    });
  }
  const base = { scene, bones, rest, skinnedMeshes };
  return { ...base, deformationCheck: verifyFingerSkinDeformation(base) };
}

function resetBinding(binding: RigBinding): void {
  for (const [name, transform] of binding.rest) {
    const bone = binding.bones.get(name)!;
    bone.position.copy(transform.position);
    bone.quaternion.copy(transform.quaternion);
    bone.scale.copy(transform.scale);
  }
  binding.scene.updateWorldMatrix(true, true);
}

function getBone(binding: RigBinding, reference: RigBoneRef): THREE.Bone {
  const bone = binding.bones.get(reference.name);
  if (!bone) throw new Error(`缺少映射骨骼 ${reference.name}`);
  return bone;
}

function worldBasisForAssetHand(binding: RigBinding, map: RigHandMap): THREE.Quaternion {
  const palm = getBone(binding, map.palmBone).getWorldPosition(new THREE.Vector3());
  const index = getBone(binding, map.fingers.index.drivenBones[0]).getWorldPosition(new THREE.Vector3());
  const middle = getBone(binding, map.fingers.middle.drivenBones[0]).getWorldPosition(new THREE.Vector3());
  const pinky = getBone(binding, map.fingers.pinky.drivenBones[0]).getWorldPosition(new THREE.Vector3());
  const forward = middle.sub(palm).normalize();
  const acrossInitial = index.sub(pinky).normalize();
  const normal = new THREE.Vector3().crossVectors(acrossInitial, forward).normalize();
  const across = new THREE.Vector3().crossVectors(forward, normal).normalize();
  if (normal.lengthSq() < 1e-10 || across.lengthSq() < 1e-10) throw new Error(`資產 ${map.side} 掌部 rest basis 退化`);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, forward, normal)).normalize();
}

function applyWorldQuaternion(bone: THREE.Bone, desiredWorld: THREE.Quaternion): void {
  const parentWorld = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
  bone.quaternion.copy(parentWorld.invert().multiply(desiredWorld)).normalize();
  bone.updateWorldMatrix(false, true);
}

function limitRotation(delta: THREE.Quaternion, maxRadians: number): THREE.Quaternion {
  const identity = new THREE.Quaternion();
  const angle = identity.angleTo(delta);
  return angle > maxRadians ? identity.slerp(delta, maxRadians / angle).normalize() : delta;
}

function localTargetToWorld(scene: THREE.Object3D, local: THREE.Vector3): THREE.Vector3 {
  return scene.parent ? scene.parent.localToWorld(local) : local;
}

function applyHand(binding: RigBinding, pose: PlaybackHandPose, map: RigHandMap): void {
  const target = buildCanonicalRigTarget(pose);
  const root = getBone(binding, map.rootBone);
  const palm = getBone(binding, map.palmBone);

  binding.scene.updateWorldMatrix(true, true);
  const palmWorld = palm.getWorldPosition(new THREE.Vector3());
  const rootWorld = root.getWorldPosition(new THREE.Vector3());
  const targetRootWorld = localTargetToWorld(binding.scene, new THREE.Vector3(...target.root));
  const desiredRootWorld = rootWorld.add(targetRootWorld.sub(palmWorld));
  root.position.copy(root.parent ? root.parent.worldToLocal(desiredRootWorld) : desiredRootWorld);
  root.updateWorldMatrix(false, true);

  const assetBasis = worldBasisForAssetHand(binding, map);
  const localTargetBasis = new THREE.Quaternion(...target.palmBasis);
  const parentWorldBasis = binding.scene.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
  const worldTargetBasis = parentWorldBasis.multiply(localTargetBasis);
  const palmWorldQuaternion = palm.getWorldQuaternion(new THREE.Quaternion());
  const palmDelta = worldTargetBasis.multiply(assetBasis.invert());
  applyWorldQuaternion(palm, palmDelta.multiply(palmWorldQuaternion));

  for (const segment of target.segments) {
    const bone = getBone(binding, segment.bone);
    const finger = Object.values(map.fingers).find((candidate) => candidate.drivenBones.some((item) => item.name === segment.bone.name));
    if (!finger) throw new Error(`無法找到 ${segment.bone.name} 的指鏈`);
    const index = finger.drivenBones.findIndex((item) => item.name === segment.bone.name);
    const childReference = index < finger.drivenBones.length - 1 ? finger.drivenBones[index + 1] : finger.terminalBone;
    const child = getBone(binding, childReference);
    const from = bone.getWorldPosition(new THREE.Vector3());
    const currentDirection = child.getWorldPosition(new THREE.Vector3()).sub(from).normalize();
    const targetDirection = new THREE.Vector3(...segment.direction).transformDirection(binding.scene.parent?.matrixWorld ?? new THREE.Matrix4());
    if (currentDirection.lengthSq() < 1e-10 || targetDirection.lengthSq() < 1e-10) continue;
    const delta = limitRotation(new THREE.Quaternion().setFromUnitVectors(currentDirection, targetDirection), THREE.MathUtils.degToRad(155));
    const desiredWorld = delta.multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
    applyWorldQuaternion(bone, desiredWorld);
  }
}

function hideHand(binding: RigBinding, map: RigHandMap): void {
  const root = getBone(binding, map.rootBone);
  // Both hands share one SkinnedMesh, so visibility cannot be toggled per side.
  // Park only the unobserved bone chain just below the camera. A huge offset is
  // intentionally avoided because it loses skinning precision after the 0.01
  // FBX import transform and can dominate the renderer's bounds.
  const hiddenWorld = localTargetToWorld(binding.scene, new THREE.Vector3(...HAND_RIG_MAP.hiddenHandPosition));
  root.position.copy(root.parent ? root.parent.worldToLocal(hiddenWorld) : hiddenWorld);
  root.updateWorldMatrix(false, true);
}

export function applyPlaybackPoseToRig(binding: RigBinding, hands: PlaybackHandPose[]): void {
  resetBinding(binding);
  for (const side of ['Left', 'Right'] as const) {
    const pose = hands.find((hand) => hand.side === side);
    if (pose) applyHand(binding, pose, HAND_RIG_MAP.hands[side]);
    else hideHand(binding, HAND_RIG_MAP.hands[side]);
  }
  for (const mesh of binding.skinnedMeshes) mesh.skeleton.update();
  binding.scene.updateWorldMatrix(true, true);
}

export function measureRigBounds(binding: RigBinding): RigBounds {
  const combined = new THREE.Box3();
  for (const mesh of binding.skinnedMeshes) {
    mesh.computeBoundingBox();
    if (mesh.boundingBox) combined.union(mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  }
  const center = combined.getCenter(new THREE.Vector3()).toArray() as [number, number, number];
  const size = combined.getSize(new THREE.Vector3()).toArray() as [number, number, number];
  return { center, size, deformationCheck: binding.deformationCheck };
}
