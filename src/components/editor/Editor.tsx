import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { api } from "../../lib/api";
import type { Project } from "../../lib/types";
import {
  clampToKept,
  cutRange,
  formatTime,
  nextKeptSegmentAt,
  sourceToEdited,
} from "../../lib/timeline";
import VideoPlayer from "./VideoPlayer";
import Timeline from "./Timeline";
import Toolbar from "./Toolbar";
import Transcript from "./Transcript";

type Props = {
  videoPath: string;
  onClose: () => void;
};

export default function Editor({ videoPath, onClose }: Props) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceTime, setSourceTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const source = project?.sources[0];
  const duration = source?.durationSec ?? 0;

  // Load / create project on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = await api.loadProjectByPath(videoPath);
        if (existing) {
          if (!cancelled) setProject(existing);
          return;
        }
        const probe = await api.probeVideo(videoPath);
        const fresh: Project = {
          version: 1,
          sources: [
            { path: videoPath, durationSec: probe.durationSec, codecInfo: probe.codecInfo },
          ],
          segments: [{ sourceIndex: 0, startSec: 0, endSec: probe.durationSec }],
        };
        await api.saveProject(videoPath, fresh);
        if (!cancelled) setProject(fresh);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoPath]);

  // Debounced autosave whenever project changes.
  const firstRender = useRef(true);
  useEffect(() => {
    if (!project) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      api.saveProject(videoPath, project).catch((e) => setError(String(e)));
    }, 300);
    return () => clearTimeout(t);
  }, [project, videoPath]);

  const flash = useCallback((msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 1800);
  }, []);

  // --- commands ---

  const togglePlay = useCallback(() => setIsPlaying((p) => !p), []);

  const seek = useCallback(
    (sec: number) => {
      if (!project) return;
      const clamped = clampToKept(project.segments, 0, Math.max(0, Math.min(duration, sec)));
      setSourceTime(clamped);
    },
    [project, duration],
  );

  const jumpStart = useCallback(() => {
    if (!project) return;
    const first = project.segments.find((s) => s.sourceIndex === 0);
    setSourceTime(first?.startSec ?? 0);
  }, [project]);

  const jumpEnd = useCallback(() => {
    if (!project) return;
    const lastKept = [...project.segments]
      .reverse()
      .find((s) => s.sourceIndex === 0);
    if (lastKept) setSourceTime(lastKept.endSec);
  }, [project]);

  const markIn = useCallback(() => {
    setInPoint(sourceTime);
    setOutPoint((prev) => (prev !== null && prev <= sourceTime ? null : prev));
    flash(`Mark in: ${formatTime(sourceTime)}`);
  }, [sourceTime, flash]);

  const markOut = useCallback(() => {
    setOutPoint(sourceTime);
    setInPoint((prev) => (prev !== null && prev >= sourceTime ? null : prev));
    flash(`Mark out: ${formatTime(sourceTime)}`);
  }, [sourceTime, flash]);

  const clearMarkers = useCallback(() => {
    setInPoint(null);
    setOutPoint(null);
  }, []);

  const cutSelection = useCallback(() => {
    if (!project || inPoint === null || outPoint === null) return;
    const start = Math.min(inPoint, outPoint);
    const end = Math.max(inPoint, outPoint);
    const newSegments = cutRange(project.segments, 0, start, end);
    setProject({ ...project, segments: newSegments });
    setInPoint(null);
    setOutPoint(null);
    setSourceTime((t) => {
      const next = nextKeptSegmentAt(newSegments, 0, end);
      return next ? next.startSec : t;
    });
    flash(`Cut ${formatTime(end - start)}`);
  }, [project, inPoint, outPoint, flash]);

  const transcribe = useCallback(async () => {
    if (!project) return;
    setTranscribing(true);
    try {
      const result = await api.transcribeSource(project.sources[0].path, 0);
      setProject((p) => (p ? { ...p, transcript: result } : p));
      flash(`Transcribed ${result.segments.length} segments`);
    } catch (e) {
      setError(String(e));
    } finally {
      setTranscribing(false);
    }
  }, [project, flash]);

  const exportEdit = useCallback(async () => {
    if (!project) return;
    const src = project.sources[0];
    const stem = src.path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "edit";
    const ext = src.path.split(".").pop() ?? "mp4";
    const defaultName = `${stem}-edit.${ext}`;
    const dir = src.path.substring(0, src.path.lastIndexOf("/"));
    const chosen = await saveDialog({
      title: "Export edit",
      defaultPath: `${dir}/${defaultName}`,
      filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "m4v"] }],
    });
    if (!chosen) return;

    setExporting(true);
    try {
      const result = await api.exportEdit({
        segments: project.segments.map((seg) => ({
          sourcePath: project.sources[seg.sourceIndex].path,
          startSec: seg.startSec,
          endSec: seg.endSec,
        })),
        outputPath: chosen,
      });
      flash(`Exported: ${formatTime(result.durationSec)}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setExporting(false);
    }
  }, [project, flash]);

  // Keyboard shortcuts.
  useEffect(() => {
    if (!project) return;
    const onKey = (e: KeyboardEvent) => {
      // Don't steal input from text fields.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      const meta = e.metaKey || e.ctrlKey;
      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          seek(sourceTime - (e.shiftKey ? 5 : 1));
          break;
        case "ArrowRight":
          e.preventDefault();
          seek(sourceTime + (e.shiftKey ? 5 : 1));
          break;
        case "Home":
          e.preventDefault();
          jumpStart();
          break;
        case "End":
          e.preventDefault();
          jumpEnd();
          break;
        case "i":
        case "I":
          e.preventDefault();
          markIn();
          break;
        case "o":
        case "O":
          e.preventDefault();
          markOut();
          break;
        case "Escape":
          e.preventDefault();
          clearMarkers();
          break;
        case "Backspace":
        case "Delete":
          e.preventDefault();
          cutSelection();
          break;
        case "e":
        case "E":
          if (meta) {
            e.preventDefault();
            exportEdit();
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    project,
    sourceTime,
    togglePlay,
    seek,
    jumpStart,
    jumpEnd,
    markIn,
    markOut,
    clearMarkers,
    cutSelection,
    exportEdit,
  ]);

  const editedPlayhead = useMemo(() => {
    if (!project) return 0;
    return sourceToEdited(project.segments, 0, sourceTime) ?? 0;
  }, [project, sourceTime]);

  const canCut = inPoint !== null && outPoint !== null && inPoint !== outPoint;

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <p className="text-sm text-danger">{error}</p>
        <button
          onClick={onClose}
          className="rounded-md border border-border bg-bg-raised px-4 py-2 text-sm hover:bg-bg-elevated"
        >
          Back to Home
        </button>
      </div>
    );
  }

  if (!project || !source) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-dim">
        Loading project…
      </div>
    );
  }

  const transcriptForSource0 =
    project.transcript && project.transcript.sourceIndex === 0 ? project.transcript : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <VideoPlayer
            sourcePath={source.path}
            segments={project.segments}
            sourceTime={sourceTime}
            isPlaying={isPlaying}
            onSourceTimeChange={setSourceTime}
            onPlayingChange={setIsPlaying}
            onEnded={() => setIsPlaying(false)}
          />
        </div>
        <aside className="w-80 shrink-0 overflow-hidden border-l border-border bg-bg-raised">
          <Transcript
            transcript={transcriptForSource0}
            sourceTime={sourceTime}
            onSeek={seek}
            busy={transcribing}
            onTranscribe={transcribe}
          />
        </aside>
      </div>

      <Toolbar
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        onJumpStart={jumpStart}
        onJumpEnd={jumpEnd}
        onSetIn={markIn}
        onSetOut={markOut}
        onClearMarkers={clearMarkers}
        onCutSelection={cutSelection}
        onExport={exportEdit}
        canCut={canCut}
        exporting={exporting}
        segments={project.segments}
        sourceDuration={duration}
      />

      <Timeline
        durationSec={duration}
        segments={project.segments}
        playheadSec={sourceTime}
        inPoint={inPoint}
        outPoint={outPoint}
        onScrub={seek}
      />

      {status && (
        <div className="pointer-events-none fixed left-1/2 top-16 -translate-x-1/2 rounded-md bg-bg-elevated/90 px-3 py-1.5 text-xs text-text backdrop-blur">
          {status}
        </div>
      )}

      {/* Keep editedPlayhead in the DOM only for debug if needed — exported for future transcript highlight. */}
      <div style={{ display: "none" }} data-edited-playhead={editedPlayhead} />
    </div>
  );
}
