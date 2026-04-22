import { useCallback, useRef } from "react";
import type { Segment, SilenceRange, SourceInfo } from "../../lib/types";
import { formatTime } from "../../lib/timeline";

type Props = {
  sources: SourceInfo[];
  activeSourceIndex: number;
  segments: Segment[];
  playheadSec: number;
  inPoint: number | null;
  outPoint: number | null;
  silences?: SilenceRange[];
  onScrub: (sec: number) => void;
  onSelectSource: (index: number) => void;
};

export default function Timeline({
  sources,
  activeSourceIndex,
  segments,
  playheadSec,
  inPoint,
  outPoint,
  silences,
  onScrub,
  onSelectSource,
}: Props) {
  return (
    <div className="flex flex-col gap-2 border-t border-border bg-bg-raised px-4 py-3">
      {sources.map((src, i) => (
        <SourceRow
          key={i}
          index={i}
          label={src.path.split("/").pop() ?? `Source ${i + 1}`}
          durationSec={src.durationSec}
          segments={segments}
          isActive={i === activeSourceIndex}
          playheadSec={i === activeSourceIndex ? playheadSec : null}
          inPoint={i === activeSourceIndex ? inPoint : null}
          outPoint={i === activeSourceIndex ? outPoint : null}
          silences={i === activeSourceIndex ? silences : undefined}
          onScrub={onScrub}
          onSelect={() => onSelectSource(i)}
        />
      ))}
    </div>
  );
}

type RowProps = {
  index: number;
  label: string;
  durationSec: number;
  segments: Segment[];
  isActive: boolean;
  playheadSec: number | null;
  inPoint: number | null;
  outPoint: number | null;
  silences?: SilenceRange[];
  onScrub: (sec: number) => void;
  onSelect: () => void;
};

function SourceRow({
  index,
  label,
  durationSec,
  segments,
  isActive,
  playheadSec,
  inPoint,
  outPoint,
  silences,
  onScrub,
  onSelect,
}: RowProps) {
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
    if (!isActive) {
      onSelect();
      return;
    }
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

  const kept = segments.filter((s) => s.sourceIndex === index);

  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[11px] text-text-faint">
        <span className="truncate text-text-dim" title={label}>
          {label}
        </span>
        <span className="shrink-0 pl-2">
          {playheadSec !== null && (
            <span className="text-text-dim">{formatTime(playheadSec)} / </span>
          )}
          {formatTime(durationSec)}
        </span>
      </div>
      <div
        ref={barRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={
          "relative rounded-md bg-bg-elevated transition-all " +
          (isActive ? "h-12 cursor-pointer" : "h-8 cursor-pointer opacity-70")
        }
      >
        <div className="absolute inset-0 rounded-md bg-bg" />

        {kept.map((s, i) => (
          <div
            key={`${s.startSec}-${s.endSec}-${i}`}
            className={
              "absolute top-0 bottom-0 " +
              (isActive
                ? "bg-accent/20 ring-1 ring-accent/40"
                : "bg-text-dim/15 ring-1 ring-text-dim/25")
            }
            style={{
              left: `${pct(s.startSec)}%`,
              width: `${pct(s.endSec - s.startSec)}%`,
            }}
          />
        ))}

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

        {selectionStart !== null && selectionEnd !== null && (
          <div
            className="absolute top-0 bottom-0 bg-danger/30 ring-1 ring-danger"
            style={{
              left: `${pct(selectionStart)}%`,
              width: `${pct(selectionEnd - selectionStart)}%`,
            }}
          />
        )}

        {inPoint !== null && (
          <Marker label="I" color="bg-emerald-500" at={pct(inPoint)} />
        )}
        {outPoint !== null && (
          <Marker label="O" color="bg-danger" at={pct(outPoint)} />
        )}

        {playheadSec !== null && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-white"
            style={{ left: `${pct(playheadSec)}%` }}
          >
            <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-sm bg-white" />
          </div>
        )}
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
