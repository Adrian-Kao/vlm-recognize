import type { HandRigMap, RigBoneRef, RigFingerMap, RigFingerName, RigHandMap } from './rigTypes';

const BASE = 'Sketchfab_model[0]/31ee11bbbd9a49ac83a12a74f1fecac4.fbx[1]/Object_2[2]/RootNode[3]/Object_4[4]/_rootJoint[5]/Root_01[7]';

function bone(nodeIndex: number, name: string, parentPath = BASE): RigBoneRef {
  return { nodeIndex, name, path: `${parentPath}/${name}[${nodeIndex}]` };
}

function finger(
  landmarks: [number, number, number, number],
  nodes: [number, string, number, string, number, string, number, string],
  palmPath: string,
): RigFingerMap {
  const first = bone(nodes[0], nodes[1], palmPath);
  const second = bone(nodes[2], nodes[3], first.path);
  const third = bone(nodes[4], nodes[5], second.path);
  const terminal = bone(nodes[6], nodes[7], third.path);
  return { landmarks, drivenBones: [first, second, third], terminalBone: terminal };
}

function hand(
  side: 'Left' | 'Right',
  rootNode: number,
  rootName: string,
  palmNode: number,
  palmName: string,
  definitions: Record<RigFingerName, [number, string, number, string, number, string, number, string]>,
): RigHandMap {
  const rootBone = bone(rootNode, rootName);
  const palmBone = bone(palmNode, palmName, rootBone.path);
  return {
    side,
    rootBone,
    palmBone,
    fingers: {
      thumb: finger([1, 2, 3, 4], definitions.thumb, palmBone.path),
      index: finger([5, 6, 7, 8], definitions.index, palmBone.path),
      middle: finger([9, 10, 11, 12], definitions.middle, palmBone.path),
      ring: finger([13, 14, 15, 16], definitions.ring, palmBone.path),
      pinky: finger([17, 18, 19, 20], definitions.pinky, palmBone.path),
    },
  };
}

export const HAND_RIG_MAP: HandRigMap = {
  schemaVersion: 1,
  status: 'rig-ready',
  assetPath: '/models/hands.glb',
  assetSha256: '83b785d2df6c24c56fd07d967642d2e965cfebcd347205a5331152c9f410c221',
  assetHands: 'both',
  rigVersion: 'hands-glb-83b785d2-v1',
  retargetVersion: 'mediapipe21-local-quaternion-v1',
  sceneScale: 7.5,
  hiddenHandPosition: [0, -8, 0],
  skinIndex: 0,
  skeletonRoot: bone(5, '_rootJoint', 'Sketchfab_model[0]/31ee11bbbd9a49ac83a12a74f1fecac4.fbx[1]/Object_2[2]/RootNode[3]/Object_4[4]'),
  hands: {
    Left: hand('Left', 8, 'J_Left_02', 9, 'J_Left_Hand_03', {
      thumb: [10, 'J_Left_HandThumb1_04', 11, 'J_Left_HandThumb2_05', 12, 'J_Left_HandThumb3_06', 13, 'J_Left_HandThumb4_07'],
      index: [14, 'J_Left_HandIndex1_08', 15, 'J_Left_HandIndex2_09', 16, 'J_Left_HandIndex3_010', 17, 'J_Left_HandIndex4_011'],
      middle: [18, 'J_Left_HandMiddle1_012', 19, 'J_Left_HandMiddle2_013', 20, 'J_Left_HandMiddle3_014', 21, 'J_Left_HandMiddle4_015'],
      ring: [22, 'J_Left_HandRing1_016', 23, 'J_Left_HandRing2_017', 24, 'J_Left_HandRing3_00', 25, 'J_Left_HandRing4_018'],
      pinky: [26, 'J_Left_HandPinky1_019', 27, 'J_Left_HandPinky2_020', 28, 'J_Left_HandPinky3_021', 29, 'J_Left_HandPinky4_022'],
    }),
    Right: hand('Right', 30, 'J_Right_023', 31, 'J_Right_Hand_024', {
      thumb: [32, 'J_Right_HandThumb1_025', 33, 'J_Right_HandThumb2_026', 34, 'J_Right_HandThumb3_027', 35, 'J_Right_HandThumb4_028'],
      index: [36, 'J_Right_HandIndex1_029', 37, 'J_Right_HandIndex2_030', 38, 'J_Right_HandIndex3_031', 39, 'J_Right_HandIndex4_032'],
      middle: [40, 'J_Right_HandMiddle1_033', 41, 'J_Right_HandMiddle2_034', 42, 'J_Right_HandMiddle3_035', 43, 'J_Right_HandMiddle4_036'],
      ring: [44, 'J_Right_HandRing1_037', 45, 'J_Right_HandRing2_038', 46, 'J_Right_HandRing3_039', 47, 'J_Right_HandRing4_040'],
      pinky: [48, 'J_Right_HandPinky1_041', 49, 'J_Right_HandPinky2_042', 50, 'J_Right_HandPinky3_043', 51, 'J_Right_HandPinky4_044'],
    }),
  },
};
