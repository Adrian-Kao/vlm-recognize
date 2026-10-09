import { distance2 } from '../math';
import type { HandSide, RawHandObservation, TrackerDetection, Vec2 } from '../types';
import { GAP_POLICY } from '../motion/gapPolicy';

interface TrackState {
  id: string;
  side: HandSide;
  sideVotes: Record<HandSide, number>;
  wrist: Vec2;
  previousWrist: Vec2;
  lastTimestampMs: number;
}

function createObservation(detection: TrackerDetection, track: TrackState, ambiguous: boolean): RawHandObservation {
  return {
    trackId: track.id,
    side: track.side,
    handednessScore: detection.handednessScore,
    imageLandmarks: detection.imageLandmarks,
    worldLandmarks: detection.worldLandmarks,
    diagnostics: {
      finite: [...detection.imageLandmarks, ...(detection.worldLandmarks ?? [])].flat().every(Number.isFinite),
      insideFrame: detection.imageLandmarks.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1),
      geometryValid: detection.imageLandmarks.length === 21
        && detection.worldLandmarks?.length === 21
        && distance2(detection.imageLandmarks[0], detection.imageLandmarks[9]) > 0.005,
      associationAmbiguous: ambiguous,
    },
  };
}

export class HandAssociator {
  private tracks: TrackState[] = [];
  private sequence = 0;

  reset(): void {
    this.tracks = [];
    this.sequence = 0;
  }

  update(detections: TrackerDetection[], timestampMs: number): RawHandObservation[] {
    const usable = detections.slice(0, 2);
    if (usable.length === 0) return [];
    const liveTracks = this.tracks.filter((track) => timestampMs - track.lastTimestampMs <= GAP_POLICY.trackingLostMs);
    const wrist = usable.map((detection): Vec2 => [detection.imageLandmarks[0][0], detection.imageLandmarks[0][1]]);
    const assignments: Array<[number, number]> = [];
    let ambiguous = false;

    if (usable.length === 2 && liveTracks.length === 2) {
      const direct = this.cost(liveTracks[0], usable[0], wrist[0], timestampMs)
        + this.cost(liveTracks[1], usable[1], wrist[1], timestampMs);
      const swapped = this.cost(liveTracks[0], usable[1], wrist[1], timestampMs)
        + this.cost(liveTracks[1], usable[0], wrist[0], timestampMs);
      ambiguous = Math.abs(direct - swapped) < 0.06;
      assignments.push(...(direct <= swapped ? [[0, 0], [1, 1]] : [[0, 1], [1, 0]]) as Array<[number, number]>);
    } else if (liveTracks.length > 0) {
      const candidates = liveTracks.flatMap((track, trackIndex) => usable.map((detection, detectionIndex) => ({
        trackIndex,
        detectionIndex,
        cost: this.cost(track, detection, wrist[detectionIndex], timestampMs),
      }))).sort((a, b) => a.cost - b.cost);
      const usedTracks = new Set<number>();
      const usedDetections = new Set<number>();
      for (const candidate of candidates) {
        if (candidate.cost > 1.2 || usedTracks.has(candidate.trackIndex) || usedDetections.has(candidate.detectionIndex)) continue;
        assignments.push([candidate.trackIndex, candidate.detectionIndex]);
        usedTracks.add(candidate.trackIndex);
        usedDetections.add(candidate.detectionIndex);
      }
    }

    const result: RawHandObservation[] = [];
    const assignedDetections = new Set(assignments.map(([, detectionIndex]) => detectionIndex));
    for (const [trackIndex, detectionIndex] of assignments) {
      const track = liveTracks[trackIndex];
      this.refreshTrack(track, usable[detectionIndex], wrist[detectionIndex], timestampMs);
      result.push(createObservation(usable[detectionIndex], track, ambiguous));
    }
    for (let detectionIndex = 0; detectionIndex < usable.length; detectionIndex += 1) {
      if (assignedDetections.has(detectionIndex)) continue;
      const detection = usable[detectionIndex];
      const track: TrackState = {
        id: `hand-${++this.sequence}`,
        side: detection.side,
        sideVotes: { Left: detection.side === 'Left' ? 2 : 0, Right: detection.side === 'Right' ? 2 : 0, Unknown: 0 },
        wrist: wrist[detectionIndex],
        previousWrist: wrist[detectionIndex],
        lastTimestampMs: timestampMs,
      };
      liveTracks.push(track);
      result.push(createObservation(detection, track, false));
    }
    this.tracks = liveTracks;
    return result.sort((a, b) => a.trackId.localeCompare(b.trackId));
  }

  private cost(track: TrackState, detection: TrackerDetection, wrist: Vec2, timestampMs: number): number {
    const dt = Math.max(1, timestampMs - track.lastTimestampMs);
    const prediction: Vec2 = [
      track.wrist[0] + (track.wrist[0] - track.previousWrist[0]) * Math.min(1, dt / 33),
      track.wrist[1] + (track.wrist[1] - track.previousWrist[1]) * Math.min(1, dt / 33),
    ];
    const positionCost = distance2(prediction, wrist) * 5;
    const sideCost = detection.side !== 'Unknown' && track.side !== 'Unknown' && detection.side !== track.side ? 0.45 : 0;
    return positionCost + sideCost;
  }

  private refreshTrack(track: TrackState, detection: TrackerDetection, wrist: Vec2, timestampMs: number): void {
    track.previousWrist = track.wrist;
    track.wrist = wrist;
    track.lastTimestampMs = timestampMs;
    track.sideVotes.Left *= 0.85;
    track.sideVotes.Right *= 0.85;
    if (detection.side !== 'Unknown') track.sideVotes[detection.side] += detection.handednessScore ?? 0.5;
    track.side = track.sideVotes.Left > track.sideVotes.Right ? 'Left' : 'Right';
  }
}
