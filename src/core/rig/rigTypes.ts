import type { HandSide, PlaybackHandPose, Vec3 } from '../types';

export type RigFingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';

export interface RigBoneRef {
  nodeIndex: number;
  name: string;
  path: string;
}

export interface RigFingerMap {
  landmarks: [number, number, number, number];
  drivenBones: [RigBoneRef, RigBoneRef, RigBoneRef];
  terminalBone: RigBoneRef;
}

export interface RigHandMap {
  side: Exclude<HandSide, 'Unknown'>;
  rootBone: RigBoneRef;
  palmBone: RigBoneRef;
  fingers: Record<RigFingerName, RigFingerMap>;
}

export interface HandRigMap {
  schemaVersion: 1;
  status: 'rig-ready' | 'rig-unmapped';
  assetPath: string;
  assetSha256: string;
  assetHands: 'both' | 'left' | 'right';
  rigVersion: string;
  retargetVersion: string;
  /** Outer scale that compensates the asset's FBX import transform (0.01). */
  sceneScale: number;
  /** Scene-local root target used only to park an unobserved side outside the camera. */
  hiddenHandPosition: Vec3;
  skinIndex: number;
  skeletonRoot: RigBoneRef;
  hands: { Left: RigHandMap; Right: RigHandMap };
}

export interface FingerSegmentTarget {
  bone: RigBoneRef;
  fromLandmark: number;
  toLandmark: number;
  direction: Vec3;
}

export interface CanonicalRigTarget {
  side: PlaybackHandPose['side'];
  root: Vec3;
  palmBasis: [number, number, number, number];
  segments: FingerSegmentTarget[];
}
