import { useEffect, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Segment, SourceInfo } from "../../lib/types";
import { findNextSegmentAfter } from "../../lib/timeline";

type Props = {
  sources: SourceInfo[];
  activeSourceIndex: number;
  segments: Segment[];
  sourceTime: number;
  isPlaying: boolean;
  onSourceTimeChange: (sec: number) => void;
  onActiveSourceChange: (index: number, sourceSec: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onEnded: () => void;
};

export default function VideoPlayer({
  sources,
  activeSourceIndex,
  segments,
  sourceTime,
  isPlaying,
  onSourceTimeChange,
  onActiveSourceChange,
  onPlayingChange,
  onEnded,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeSrc = sources[activeSourceIndex]?.path ?? "";
  const srcUrl = activeSrc ? convertFileSrc(activeSrc) : "";

  // When the active source changes, swap src and seek to sourceTime once loaded.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => {
      v.currentTime = sourceTime;
      if (isPlaying) v.play().catch(() => onPlayingChange(false));
    };
    v.addEventListener("loadedmetadata", onLoaded, { once: true });
    return () => v.removeEventListener("loadedmetadata", onLoaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcUrl]);

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

  // On every tick, advance across segment and source boundaries.
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;

    const current = segments.find(
      (s) =>
        s.sourceIndex === activeSourceIndex && t >= s.startSec && t < s.endSec,
    );
    if (current) {
      onSourceTimeChange(t);
      return;
    }

    const next = findNextSegmentAfter(segments, activeSourceIndex, t);
    if (!next) {
      onPlayingChange(false);
      onEnded();
      return;
    }
    if (next.sourceIndex === activeSourceIndex) {
      v.currentTime = next.startSec;
      onSourceTimeChange(next.startSec);
    } else {
      onActiveSourceChange(next.sourceIndex, next.startSec);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center bg-black">
      <video
        ref={videoRef}
        src={srcUrl}
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
