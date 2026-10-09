import { useMemo } from 'react';
import * as THREE from 'three';
import type { PlaybackHandPose, Vec3 } from '../core/types';
import { HAND_BONES } from '../core/playback/handTopology';

function CylinderBetween({ start, end, radius, color }: { start: Vec3; end: Vec3; radius: number; color: string }) {
  const transform = useMemo(() => {
    const from = new THREE.Vector3(...start);
    const to = new THREE.Vector3(...end);
    const direction = to.clone().sub(from);
    const length = Math.max(0.001, direction.length());
    const position = from.clone().add(to).multiplyScalar(0.5);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return { length, position, quaternion };
  }, [end, start]);
  return (
    <mesh position={transform.position} quaternion={transform.quaternion} castShadow receiveShadow>
      <capsuleGeometry args={[radius, Math.max(0.001, transform.length - radius * 2), 6, 12]} />
      <meshStandardMaterial color={color} roughness={0.58} metalness={0.03} />
    </mesh>
  );
}

function Palm({ joints, color }: { joints: Vec3[]; color: string }) {
  const transform = useMemo(() => {
    const wrist = new THREE.Vector3(...joints[0]);
    const middle = new THREE.Vector3(...joints[9]);
    const index = new THREE.Vector3(...joints[5]);
    const pinky = new THREE.Vector3(...joints[17]);
    const xAxis = index.clone().sub(pinky).normalize();
    const yAxis = middle.clone().sub(wrist).normalize();
    let zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
    if (zAxis.lengthSq() < 1e-6) zAxis = new THREE.Vector3(0, 0, 1);
    const correctedX = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
    const matrix = new THREE.Matrix4().makeBasis(correctedX, yAxis, zAxis);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);
    const position = wrist.clone().lerp(middle, 0.52);
    const width = Math.max(0.22, index.distanceTo(pinky) * 1.08);
    const height = Math.max(0.28, wrist.distanceTo(middle) * 1.22);
    return { position, quaternion, scale: [width, height, Math.max(0.1, width * 0.22)] as Vec3 };
  }, [joints]);
  return (
    <mesh position={transform.position} quaternion={transform.quaternion} scale={transform.scale} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1, 2, 2, 1]} />
      <meshStandardMaterial color={color} roughness={0.62} metalness={0.02} />
    </mesh>
  );
}

export function ProceduralHand({ pose }: { pose: PlaybackHandPose }) {
  const color = pose.side === 'Left' ? '#ff9f85' : '#b9ff66';
  return (
    <group>
      <Palm joints={pose.joints} color={color} />
      {HAND_BONES.map(([start, end]) => (
        <CylinderBetween
          key={`${start}-${end}`}
          start={pose.joints[start]}
          end={pose.joints[end]}
          radius={start === 0 ? 0.07 : end % 4 === 0 ? 0.038 : 0.052}
          color={color}
        />
      ))}
      {pose.joints.map((joint, index) => (
        <mesh key={index} position={joint} castShadow>
          <sphereGeometry args={[index === 0 ? 0.075 : 0.057, 14, 10]} />
          <meshStandardMaterial color={color} roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}
