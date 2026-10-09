import * as THREE from 'three';
import type { PlaybackHandPose, Vec3 } from '../types';
import { HAND_RIG_MAP } from './handRigMap';
import type { CanonicalRigTarget } from './rigTypes';

function vector(from: Vec3, to: Vec3): THREE.Vector3 {
  return new THREE.Vector3(...to).sub(new THREE.Vector3(...from));
}

function normalizedDirection(from: Vec3, to: Vec3): Vec3 {
  const result = vector(from, to);
  if (result.lengthSq() < 1e-10) throw new Error('骨段方向退化，無法驅動 GLB 骨架');
  result.normalize();
  return result.toArray() as Vec3;
}

export function palmBasisQuaternion(joints: Vec3[]): THREE.Quaternion {
  if (joints.length !== 21) throw new Error('GLB retargeting 需要 21 個 landmarks');
  const forward = vector(joints[0], joints[9]).normalize();
  const acrossInitial = vector(joints[17], joints[5]).normalize();
  const normal = new THREE.Vector3().crossVectors(acrossInitial, forward).normalize();
  if (normal.lengthSq() < 1e-10) throw new Error('掌部基底退化，無法驅動 GLB 骨架');
  const across = new THREE.Vector3().crossVectors(forward, normal).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, forward, normal)).normalize();
}

export function buildCanonicalRigTarget(pose: PlaybackHandPose): CanonicalRigTarget {
  if (pose.side === 'Unknown') throw new Error('手側不確定，拒絕套用左右手 GLB mapping');
  const map = HAND_RIG_MAP.hands[pose.side];
  const segments = Object.values(map.fingers).flatMap((finger) => finger.drivenBones.map((bone, index) => {
    const fromLandmark = finger.landmarks[index];
    const toLandmark = finger.landmarks[index + 1];
    return { bone, fromLandmark, toLandmark, direction: normalizedDirection(pose.joints[fromLandmark], pose.joints[toLandmark]) };
  }));
  return {
    side: pose.side,
    root: [...pose.joints[0]] as Vec3,
    palmBasis: palmBasisQuaternion(pose.joints).toArray() as [number, number, number, number],
    segments,
  };
}

