import { useEffect, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Segment } from "../../lib/types";
import { nextKeptSegmentAt } from "../../lib/timeline";

type Props = {
  sourcePath: string;
  segments: Segment[];
  sourceTime: number;
  isPlaying: boolean;
  onSourceTimeChange: (sec: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onEnded: () => void;
};

export default function VideoPlayer({
  sourcePath,
  segments,
  sourceTime,
  isPlaying,
  onSourceTimeChange,
  onPlayingChange,
  onEnded,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const srcUrl = useRef(convertFileSrc(sourcePath));
  // Re-derive if the source path changes.
  if (srcUrl.current && !srcUrl.current.includes(encodeURIComponent(sourcePath.split("/").pop() ?? ""))) {
    srcUrl.current = convertFileSrc(sourcePath);
  }

  // Keep video.currentTime in sync with sourceTime prop when the gap is meaningful.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (Math.abs(v.currentTime - sourceTime) > 0.15) {
      v.currentTime = sourceTime;
    }
  }, [sourceTime]);

  // Drive play/pause imperatively.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying && v.paused) {
      v.play().catch(() => onPlayingChange(false));
    } else if (!isPlaying && !v.paused) {
      v.pause();
    }
  }, [isPlaying, onPlayingChange]);

  // On every tick, check if we've crossed into a cut region and skip forward.
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    const current = segments.find(
      (s) => s.sourceIndex === 0 && t >= s.startSec && t < s.endSec,
    );
    if (!current) {
      const next = nextKeptSegmentAt(segments, 0, t);
      if (!next || next.startSec <= t) {
        onPlayingChange(false);
        onEnded();
        return;
      }
      v.currentTime = next.startSec;
      onSourceTimeChange(next.startSec);
      return;
    }
    onSourceTimeChange(t);
  };

  return (
    <div className="flex h-full w-full items-center justify-center bg-black">
      <video
        ref={videoRef}
        src={srcUrl.current}
        className="max-h-full max-w-full"
        onTimeUpdate={onTimeUpdate}
        onPlay={() => onPlayingChange(true)}
        onPause={() => onPlayingChange(false)}
        onEnded={onEnded}
        onClick={() => onPlayingChange(!isPlaying)}
        preload="auto"
      />
    </div>
  );
}
