import type { Segment, Transcript, TranscriptSegment } from "./types";

export function editedDuration(segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + (s.endSec - s.startSec), 0);
}

export function editedToSource(
  segments: Segment[],
  editedSec: number,
): { sourceIndex: number; sourceSec: number } | null {
  let acc = 0;
  for (const seg of segments) {
    const len = seg.endSec - seg.startSec;
    if (editedSec < acc + len) {
      return {
        sourceIndex: seg.sourceIndex,
        sourceSec: seg.startSec + Math.max(0, editedSec - acc),
      };
    }
    acc += len;
  }
  return null;
}

export function sourceToEdited(
  segments: Segment[],
  sourceIndex: number,
  sourceSec: number,
): number | null {
  let acc = 0;
  for (const seg of segments) {
    if (
      seg.sourceIndex === sourceIndex &&
      sourceSec >= seg.startSec &&
      sourceSec < seg.endSec
    ) {
      return acc + (sourceSec - seg.startSec);
    }
    acc += seg.endSec - seg.startSec;
  }
  return null;
}

/**
 * Remove the inclusive range [startSec, endSec) from the kept segments for a given source.
 * Segments that straddle the range are split or trimmed.
 */
export function cutRange(
  segments: Segment[],
  sourceIndex: number,
  startSec: number,
  endSec: number,
): Segment[] {
  if (endSec <= startSec) return segments;
  const out: Segment[] = [];
  for (const seg of segments) {
    if (seg.sourceIndex !== sourceIndex) {
      out.push(seg);
      continue;
    }
    if (seg.endSec <= startSec || seg.startSec >= endSec) {
      out.push(seg);
    } else if (seg.startSec < startSec && seg.endSec > endSec) {
      out.push({ sourceIndex, startSec: seg.startSec, endSec: startSec });
      out.push({ sourceIndex, startSec: endSec, endSec: seg.endSec });
    } else if (seg.startSec < startSec) {
      out.push({ sourceIndex, startSec: seg.startSec, endSec: startSec });
    } else if (seg.endSec > endSec) {
      out.push({ sourceIndex, startSec: endSec, endSec: seg.endSec });
    }
  }
  return out;
}

/**
 * Find the kept segment that contains the given source-space time, or the next one after it.
 * Returns null if nothing at or after.
 */
export function nextKeptSegmentAt(
  segments: Segment[],
  sourceIndex: number,
  sourceSec: number,
): Segment | null {
  let containing: Segment | null = null;
  let next: Segment | null = null;
  for (const seg of segments) {
    if (seg.sourceIndex !== sourceIndex) continue;
    if (sourceSec >= seg.startSec && sourceSec < seg.endSec) {
      containing = seg;
      break;
    }
    if (seg.startSec >= sourceSec && (!next || seg.startSec < next.startSec)) {
      next = seg;
    }
  }
  return containing ?? next;
}

/**
 * Rewrite transcript segments into edited-timeline space.
 * Pieces entirely inside a cut are dropped; pieces that overlap one or more kept
 * segments produce a single output anchored to the largest overlap, so the text
 * isn't duplicated when a line straddles a cut.
 */
export function remapTranscriptToEdited(
  transcript: Transcript,
  segments: Segment[],
): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  for (const t of transcript.segments) {
    let bestOverlap = 0;
    let bestStartSource = 0;
    let bestEndSource = 0;
    for (const seg of segments) {
      if (seg.sourceIndex !== transcript.sourceIndex) continue;
      const overlapStart = Math.max(t.startSec, seg.startSec);
      const overlapEnd = Math.min(t.endSec, seg.endSec);
      const overlap = overlapEnd - overlapStart;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestStartSource = overlapStart;
        bestEndSource = overlapEnd;
      }
    }
    if (bestOverlap <= 0) continue;
    const editedStart = sourceToEdited(segments, transcript.sourceIndex, bestStartSource);
    if (editedStart === null) continue;
    out.push({
      startSec: editedStart,
      endSec: editedStart + (bestEndSource - bestStartSource),
      text: t.text,
    });
  }
  out.sort((a, b) => a.startSec - b.startSec);
  return out;
}

export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  const base = h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
  return `${base}.${String(ms).padStart(3, "0").slice(0, 2)}`;
}

/**
 * Given the currently-playing source position, find the next segment to play
 * across ALL sources in segments[] order. Used by the preview player to advance
 * past cuts and across source boundaries.
 */
export function findNextSegmentAfter(
  segments: Segment[],
  currentSourceIndex: number,
  currentSourceSec: number,
): Segment | null {
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (
      s.sourceIndex === currentSourceIndex &&
      currentSourceSec >= s.startSec &&
      currentSourceSec < s.endSec
    ) {
      return segments[i + 1] ?? null;
    }
  }
  return null;
}

export function clampToKept(
  segments: Segment[],
  sourceIndex: number,
  sourceSec: number,
): number {
  const next = nextKeptSegmentAt(segments, sourceIndex, sourceSec);
  if (!next) {
    const last = [...segments].reverse().find((s) => s.sourceIndex === sourceIndex);
    return last ? last.endSec : 0;
  }
  if (sourceSec < next.startSec) return next.startSec;
  if (sourceSec >= next.endSec) return next.endSec;
  return sourceSec;
}
