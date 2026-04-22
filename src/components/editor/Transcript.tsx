import { useEffect, useMemo, useRef } from "react";
import type { Transcript as TranscriptData } from "../../lib/types";
import { formatTime } from "../../lib/timeline";

type Props = {
  transcript: TranscriptData | null;
  sourceTime: number;
  onSeek: (sec: number) => void;
  busy?: boolean;
  onTranscribe: () => void;
  transcriptActive: boolean;
  transcriptSourceLabel?: string;
};

export default function Transcript({
  transcript,
  sourceTime,
  onSeek,
  busy,
  onTranscribe,
  transcriptActive,
  transcriptSourceLabel,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const activeIndex = useMemo(() => {
    if (!transcript || !transcriptActive) return -1;
    return transcript.segments.findIndex(
      (s) => sourceTime >= s.startSec && sourceTime < s.endSec,
    );
  }, [transcript, sourceTime, transcriptActive]);

  useEffect(() => {
    if (activeIndex < 0) return;
    const el = itemRefs.current.get(activeIndex);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  if (!transcript) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-text-dim">No transcript yet.</p>
        <button
          onClick={onTranscribe}
          disabled={busy}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Transcribing…" : "Transcribe"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-text-dim">Transcript</span>
        <button
          onClick={onTranscribe}
          disabled={busy}
          className="rounded-md px-2 py-0.5 text-[11px] text-text-dim hover:bg-bg-elevated hover:text-text disabled:opacity-50"
        >
          {busy ? "…" : "Re-run"}
        </button>
      </div>
      {!transcriptActive && (
        <div className="border-b border-border bg-bg-elevated/50 px-3 py-1.5 text-[11px] text-text-faint">
          Transcript is for{" "}
          <span className="text-text-dim">{transcriptSourceLabel ?? "another clip"}</span>
          . Click a line to jump back.
        </div>
      )}
      <div
        ref={listRef}
        className={
          "flex-1 overflow-y-auto " + (transcriptActive ? "" : "opacity-60")
        }
      >
        {transcript.segments.map((seg, i) => {
          const active = i === activeIndex;
          return (
            <button
              key={`${seg.startSec}-${i}`}
              ref={(el) => {
                if (el) itemRefs.current.set(i, el);
                else itemRefs.current.delete(i);
              }}
              onClick={() => onSeek(seg.startSec)}
              className={
                "flex w-full gap-2 border-l-2 px-3 py-1.5 text-left text-sm transition-colors " +
                (active
                  ? "border-accent bg-accent/10 text-text"
                  : "border-transparent text-text-dim hover:bg-bg-elevated hover:text-text")
              }
            >
              <span className="shrink-0 font-mono text-[11px] text-text-faint">
                {formatTime(seg.startSec)}
              </span>
              <span className="flex-1">{seg.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
