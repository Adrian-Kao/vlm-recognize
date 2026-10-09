import { Canvas, useThree } from '@react-three/fiber';
import { Grid, Line, OrbitControls } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { PlaybackClip } from '../core/types';
import { samplePlaybackPose } from '../core/playback/samplePlaybackPose';
import { LandmarkDebug } from './LandmarkDebug';
import { ProceduralHand } from './ProceduralHand';

export type CameraPreset = 'front' | 'side' | 'back';

function CameraRig({ preset, resetToken }: { preset: CameraPreset; resetToken: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const positions: Record<CameraPreset, [number, number, number]> = {
      front: [0, 0.4, 5.2],
      side: [5.2, 0.4, 0],
      back: [0, 0.4, -5.2],
    };
    camera.position.set(...positions[preset]);
    camera.lookAt(0, 0.45, 0);
    camera.updateProjectionMatrix();
  }, [camera, preset, resetToken]);
  return null;
}

interface HandSceneProps {
  clip: PlaybackClip;
  timeMs: number;
  showTrajectory: boolean;
  debugSkeleton: boolean;
  cameraPreset: CameraPreset;
  resetToken: number;
}

export function HandScene({ clip, timeMs, showTrajectory, debugSkeleton, cameraPreset, resetToken }: HandSceneProps) {
  const pose = useMemo(() => samplePlaybackPose(clip, timeMs), [clip, timeMs]);
  return (
    <div className="hand-scene" data-testid="hand-scene">
      <Canvas shadows="basic" dpr={[1, 1.75]} camera={{ fov: 42, near: 0.01, far: 100, position: [0, 0.4, 5.2] }}
        onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace; }}>
        <color attach="background" args={['#07100e']} />
        <fog attach="fog" args={['#07100e', 7, 13]} />
        <ambientLight intensity={1.2} />
        <directionalLight position={[3, 5, 4]} intensity={2.1} castShadow shadow-mapSize={[1024, 1024]} />
        <pointLight position={[-4, 1, 2]} intensity={18} color="#5fe7ff" distance={9} />
        <group position={[0, -0.25, 0]}>
          {pose.hands.map((hand) => <ProceduralHand key={hand.trackId} pose={hand} />)}
          {debugSkeleton && pose.hands.map((hand) => <LandmarkDebug key={`debug-${hand.trackId}`} pose={hand} />)}
          {showTrajectory && Object.entries(clip.trajectoryByTrack).map(([trackId, points]) => (
            <Line key={trackId} points={points} color="#f7c86d" lineWidth={2} dashed dashSize={0.08} gapSize={0.05} />
          ))}
        </group>
        <Grid position={[0, -1.7, 0]} args={[9, 9]} cellColor="#173a33" sectionColor="#2e6d60" fadeDistance={10} infiniteGrid />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} target={[0, 0.35, 0]} minDistance={2.3} maxDistance={9} />
        <CameraRig preset={cameraPreset} resetToken={resetToken} />
      </Canvas>
      <span className="scene-badge">展示座標｜全域深度未經量測</span>
    </div>
  );
}
