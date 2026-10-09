import { Canvas, useThree } from '@react-three/fiber';
import { Grid, Line, OrbitControls } from '@react-three/drei';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { PlaybackClip } from '../core/types';
import { samplePlaybackPose } from '../core/playback/samplePlaybackPose';
import { HAND_RIG_MAP } from '../core/rig/handRigMap';
import { validateHandAsset } from '../core/rig/validateHandAsset';
import { LandmarkDebug } from './LandmarkDebug';
import { ProceduralHand } from './ProceduralHand';
import { RiggedHands } from './RiggedHands';
import { HandAssetBoundary } from './HandAssetBoundary';
import type { RigBounds } from '../core/rig/applyRigPose';

export type CameraPreset = 'front' | 'side' | 'back';
export type HandViewMode = 'glb' | 'raw' | 'fitted';

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
  viewMode: HandViewMode;
  cameraPreset: CameraPreset;
  resetToken: number;
}

export function HandScene({ clip, timeMs, showTrajectory, debugSkeleton, viewMode, cameraPreset, resetToken }: HandSceneProps) {
  const pose = useMemo(() => samplePlaybackPose(clip, timeMs), [clip, timeMs]);
  const [assetState, setAssetState] = useState<'checking' | 'loading' | 'ready' | 'error'>('checking');
  const [assetError, setAssetError] = useState('');
  const [rigBounds, setRigBounds] = useState<RigBounds | null>(null);
  useEffect(() => {
    let active = true;
    void validateHandAsset().then((result) => {
      if (!active) return;
      if (result.status === 'ready') setAssetState('loading');
      else { setAssetState('error'); setAssetError(result.message); }
    });
    return () => { active = false; };
  }, []);
  const markReady = useCallback((bounds: RigBounds) => { setRigBounds(bounds); setAssetState('ready'); }, []);
  const markError = useCallback((message: string) => { setAssetState('error'); setAssetError(message); }, []);
  const fallbackHands = pose.hands.map((hand) => <ProceduralHand key={`fallback-${hand.trackId}`} pose={hand} />);
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
          {viewMode === 'glb' && assetState !== 'error' && assetState !== 'checking' ? (
            <HandAssetBoundary fallback={fallbackHands} onError={markError}>
              <Suspense fallback={fallbackHands}><RiggedHands hands={pose.hands} onReady={markReady} /></Suspense>
            </HandAssetBoundary>
          ) : null}
          {viewMode === 'glb' && (assetState === 'checking' || assetState === 'error') && fallbackHands}
          {viewMode === 'fitted' && pose.hands.map((hand) => {
            const fitted = { ...hand, joints: hand.fittedJoints ?? hand.joints };
            return <group key={hand.trackId}><ProceduralHand pose={fitted} /><LandmarkDebug pose={fitted} color="#b9ff66" /></group>;
          })}
          {(viewMode === 'raw' || debugSkeleton) && pose.hands.map((hand) => <LandmarkDebug key={`debug-${hand.trackId}`} pose={hand} />)}
          {showTrajectory && Object.entries(clip.trajectoryByTrack).map(([trackId, points]) => (
            <Line key={trackId} points={points} color="#f7c86d" lineWidth={2} dashed dashSize={0.08} gapSize={0.05} />
          ))}
        </group>
        <Grid position={[0, -1.7, 0]} args={[9, 9]} cellColor="#173a33" sectionColor="#2e6d60" fadeDistance={10} infiniteGrid />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} target={[0, 0.35, 0]} minDistance={2.3} maxDistance={9} />
        <CameraRig preset={cameraPreset} resetToken={resetToken} />
      </Canvas>
      <span className="scene-badge">展示座標｜全域深度未經量測</span>
      {viewMode === 'glb' && <span className={`asset-badge ${assetState}`} data-testid="hand-asset-status" data-skeleton-instances={pose.hands.length}>
        {assetState === 'ready' ? `GLB rig 已就緒｜${HAND_RIG_MAP.rigVersion}｜${pose.hands.length} skeleton clone${rigBounds ? `｜bbox ${rigBounds.size.map((value) => value.toFixed(1)).join('×')}｜skin Δ ${rigBounds.deformationCheck.delta.toFixed(3)}` : ''}`
          : assetState === 'error' ? `GLB 錯誤，程序化降級｜${assetError}`
            : '正在驗證並載入 GLB rig…'}
      </span>}
    </div>
  );
}
