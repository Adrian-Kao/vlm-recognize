import { useGLTF } from '@react-three/drei';
import { useLayoutEffect, useMemo } from 'react';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { PlaybackHandPose } from '../core/types';
import { HAND_RIG_MAP } from '../core/rig/handRigMap';
import { applyPlaybackPoseToRig, createRigBinding, measureRigBounds, type RigBounds } from '../core/rig/applyRigPose';

export function handAssetUrl(): string {
  return `${import.meta.env.BASE_URL}${HAND_RIG_MAP.assetPath.replace(/^\//, '')}`;
}

function RiggedHandInstance({ hand, onReady }: { hand: PlaybackHandPose; onReady?: (bounds: RigBounds) => void }) {
  const gltf = useGLTF(handAssetUrl());
  const instance = useMemo(() => {
    const cloned = cloneSkeleton(gltf.scene);
    // The GLB contains an FBX import node scaled to 0.01.  This mapping-bound
    // outer scale makes one palm roughly one scene unit without altering bones.
    cloned.scale.setScalar(HAND_RIG_MAP.sceneScale);
    cloned.updateMatrixWorld(true);
    return cloned;
  }, [gltf.scene]);
  const binding = useMemo(() => createRigBinding(instance), [instance]);

  useLayoutEffect(() => {
    applyPlaybackPoseToRig(binding, [hand]);
    onReady?.(measureRigBounds(binding));
  }, [binding, hand, onReady]);

  return <primitive object={instance} />;
}

export function RiggedHands({ hands, onReady }: { hands: PlaybackHandPose[]; onReady?: (bounds: RigBounds) => void }) {
  // The supplied GLB stores both sides in one skin. Clone the complete skinned
  // hierarchy once per observed hand so dual-hand playback never shares Bone
  // transforms; the unused side inside each clone is parked out of view.
  return <>{hands.map((hand) => <RiggedHandInstance key={hand.trackId} hand={hand} onReady={onReady} />)}</>;
}

useGLTF.preload(handAssetUrl());
