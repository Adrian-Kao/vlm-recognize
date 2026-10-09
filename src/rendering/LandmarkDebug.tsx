import { Line } from '@react-three/drei';
import type { PlaybackHandPose } from '../core/types';
import { HAND_BONES } from '../core/playback/handTopology';

export function LandmarkDebug({ pose, color = '#5fe7ff' }: { pose: PlaybackHandPose; color?: string }) {
  return (
    <group>
      {HAND_BONES.map(([start, end]) => (
        <Line key={`${start}-${end}`} points={[pose.joints[start], pose.joints[end]]} color={color} lineWidth={1.5} />
      ))}
      {pose.joints.map((joint, index) => (
        <mesh key={index} position={joint}>
          <sphereGeometry args={[0.025, 8, 6]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}
