import { useCallback, useRef } from "react";
import type { Segment, SilenceRange } from "../../lib/types";
import { formatTime } from "../../lib/timeline";

type Props = {
  durationSec: number;
  segments: Segment[];
  playheadSec: number;
  inPoint: number | null;
  outPoint: number | null;
  silences?: SilenceRange[];
  onScrub: (sec: number) => void;
};

export default function Timeline({
  durationSec,
  segments,
  playheadSec,
  inPoint,
  outPoint,
  silences,
  onScrub,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const toSec = useCallback(
    (clientX: number) => {
      const el = barRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * durationSec;
    },
    [durationSec],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    onScrub(toSec(e.clientX));
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    onScrub(toSec(e.clientX));
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    draggingRef.current = false;
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  const pct = (sec: number) => (durationSec > 0 ? (sec / durationSec) * 100 : 0);

  const selectionStart =
    inPoint !== null && outPoint !== null ? Math.min(inPoint, outPoint) : null;
  const selectionEnd =
    inPoint !== null && outPoint !== null ? Math.max(inPoint, outPoint) : null;

  return (
    <div className="flex flex-col gap-1.5 border-t border-border bg-bg-raised px-4 py-3">
      <div className="flex items-center justify-between font-mono text-[11px] text-text-faint">
        <span>0:00</span>
        <span className="text-text-dim">{formatTime(playheadSec)}</span>
        <span>{formatTime(durationSec)}</span>
      </div>

      <div
        ref={barRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative h-12 cursor-pointer rounded-md bg-bg-elevated"
      >
        {/* Cut regions: the whole bar is a "cut" background; kept segments are drawn on top. */}
        <div className="absolute inset-0 rounded-md bg-bg" />

        {segments
          .filter((s) => s.sourceIndex === 0)
          .map((s, i) => (
            <div
              key={`${s.startSec}-${s.endSec}-${i}`}
              className="absolute top-0 bottom-0 bg-accent/20 ring-1 ring-accent/40"
              style={{
                left: `${pct(s.startSec)}%`,
                width: `${pct(s.endSec - s.startSec)}%`,
              }}
            />
          ))}

        {/* Detected silences */}
        {silences?.map((s, i) => (
          <div
            key={`silence-${i}`}
            className="pointer-events-none absolute top-0 bottom-0 bg-amber-400/25 ring-1 ring-amber-400/60"
            style={{
              left: `${pct(s.startSec)}%`,
              width: `${pct(s.endSec - s.startSec)}%`,
            }}
          />
        ))}

        {/* Selection range */}
        {selectionStart !== null && selectionEnd !== null && (
          <div
            className="absolute top-0 bottom-0 bg-danger/30 ring-1 ring-danger"
            style={{
              left: `${pct(selectionStart)}%`,
              width: `${pct(selectionEnd - selectionStart)}%`,
            }}
          />
        )}

        {/* In marker */}
        {inPoint !== null && (
          <Marker label="I" color="bg-emerald-500" at={pct(inPoint)} />
        )}
        {/* Out marker */}
        {outPoint !== null && (
          <Marker label="O" color="bg-danger" at={pct(outPoint)} />
        )}

        {/* Playhead */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-white"
          style={{ left: `${pct(playheadSec)}%` }}
        >
          <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-sm bg-white" />
        </div>
      </div>
    </div>
  );
}

function Marker({ label, color, at }: { label: string; color: string; at: number }) {
  return (
    <div
      className="pointer-events-none absolute top-0 bottom-0 w-px"
      style={{ left: `${at}%` }}
    >
      <div className={`absolute inset-y-0 w-px ${color}`} />
      <div
        className={`absolute -top-1 left-0 -translate-x-1/2 rounded-sm px-1 py-0 text-[9px] font-bold text-black ${color}`}
      >
        {label}
      </div>
    </div>
  );
}
