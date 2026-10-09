import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HAND_RIG_MAP } from '../../core/rig/handRigMap';
import { buildCanonicalRigTarget } from '../../core/rig/retargetHandPose';
import { buildPlaybackClip } from '../../core/playback/buildPlaybackClip';
import { samplePlaybackPose } from '../../core/playback/samplePlaybackPose';
import { makeSyntheticSample } from '../fixtures/synthetic';

function parseJsonChunk(buffer: Buffer) {
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength).replaceAll('\0', '').trim()) as {
    nodes: Array<{ name?: string }>;
    skins: Array<{ joints: number[] }>;
    meshes: Array<{ primitives: Array<{ attributes: Record<string, number> }> }>;
  };
}

describe('真實 hands.glb 與 rig mapping', () => {
  it('mapping 綁定實際 SHA、46 joints 與左右手完整指鏈', () => {
    const buffer = readFileSync('public/models/hands.glb');
    const json = parseJsonChunk(buffer);
    expect(createHash('sha256').update(buffer).digest('hex')).toBe(HAND_RIG_MAP.assetSha256);
    expect(json.skins).toHaveLength(1);
    expect(json.skins[0].joints).toHaveLength(46);
    expect(json.meshes[0].primitives[0].attributes).toMatchObject({ JOINTS_0: expect.any(Number), WEIGHTS_0: expect.any(Number) });
    for (const hand of Object.values(HAND_RIG_MAP.hands)) {
      expect(json.nodes[hand.rootBone.nodeIndex].name).toBe(hand.rootBone.name);
      expect(json.nodes[hand.palmBone.nodeIndex].name).toBe(hand.palmBone.name);
      for (const finger of Object.values(hand.fingers)) {
        expect(finger.drivenBones).toHaveLength(3);
        for (const bone of [...finger.drivenBones, finger.terminalBone]) expect(json.nodes[bone.nodeIndex].name).toBe(bone.name);
      }
    }
  });

  it('同一時間點產生完全相同的 root、掌部與 15 段方向，握拳變化會改變指節目標', () => {
    const clip = buildPlaybackClip(makeSyntheticSample({ path: 'right', pose: 'open-close' }));
    const startPose = samplePlaybackPose(clip, 0).hands[0];
    const samePose = samplePlaybackPose(clip, 0).hands[0];
    const endPose = samplePlaybackPose(clip, clip.durationMs).hands[0];
    const start = buildCanonicalRigTarget(startPose);
    const repeated = buildCanonicalRigTarget(samePose);
    const end = buildCanonicalRigTarget(endPose);
    expect(start).toEqual(repeated);
    expect(start.segments).toHaveLength(15);
    expect(start.segments.some((segment) => segment.bone.name.includes('Thumb'))).toBe(true);
    expect(end.root[0]).toBeGreaterThan(start.root[0]);
    expect(end.segments.map((segment) => segment.direction)).not.toEqual(start.segments.map((segment) => segment.direction));
  });
});

