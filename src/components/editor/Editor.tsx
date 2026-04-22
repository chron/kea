import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { api } from "../../lib/api";
import { suggestFilename } from "../../lib/llm";
import { useFileDrop } from "../../lib/useFileDrop";
import type { Project, SilenceRange } from "../../lib/types";
import {
  clampToKept,
  cutRange,
  formatTime,
  nextKeptSegmentAt,
  remapTranscriptToEdited,
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
  const [currentPath, setCurrentPath] = useState(videoPath);
  const [error, setError] = useState<string | null>(null);
  const [sourceTime, setSourceTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [detectingSilence, setDetectingSilence] = useState(false);
  const [silences, setSilences] = useState<SilenceRange[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [appending, setAppending] = useState(false);
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  const source = project?.sources[0];
  const activeSource = project?.sources[activeSourceIndex];
  const duration = activeSource?.durationSec ?? 0;

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
      api.saveProject(currentPath, project).catch((e) => setError(String(e)));
    }, 300);
    return () => clearTimeout(t);
  }, [project, currentPath]);

  const flash = useCallback((msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 1800);
  }, []);

  // --- commands ---

  const togglePlay = useCallback(() => setIsPlaying((p) => !p), []);

  const seek = useCallback(
    (sec: number) => {
      if (!project) return;
      const clamped = clampToKept(
        project.segments,
        activeSourceIndex,
        Math.max(0, Math.min(duration, sec)),
      );
      setSourceTime(clamped);
    },
    [project, duration, activeSourceIndex],
  );

  const selectSource = useCallback(
    (index: number) => {
      if (!project) return;
      const first = project.segments.find((s) => s.sourceIndex === index);
      setActiveSourceIndex(index);
      setSourceTime(first?.startSec ?? 0);
      setInPoint(null);
      setOutPoint(null);
      setSilences([]);
    },
    [project],
  );

  const jumpStart = useCallback(() => {
    if (!project) return;
    const first = project.segments.find((s) => s.sourceIndex === activeSourceIndex);
    setSourceTime(first?.startSec ?? 0);
  }, [project, activeSourceIndex]);

  const jumpEnd = useCallback(() => {
    if (!project) return;
    const lastKept = [...project.segments]
      .reverse()
      .find((s) => s.sourceIndex === activeSourceIndex);
    if (lastKept) setSourceTime(lastKept.endSec);
  }, [project, activeSourceIndex]);

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
    const newSegments = cutRange(project.segments, activeSourceIndex, start, end);
    setProject({ ...project, segments: newSegments });
    setInPoint(null);
    setOutPoint(null);
    setSourceTime((t) => {
      const next = nextKeptSegmentAt(newSegments, activeSourceIndex, end);
      return next ? next.startSec : t;
    });
    flash(`Cut ${formatTime(end - start)}`);
  }, [project, inPoint, outPoint, activeSourceIndex, flash]);

  const detectSilence = useCallback(async () => {
    if (!project) return;
    setDetectingSilence(true);
    try {
      const settings = await api.getSettings();
      const ranges = await api.detectSilence(
        project.sources[activeSourceIndex].path,
        settings.silenceThresholdDb,
        settings.silenceMinSec,
      );
      setSilences(ranges);
      flash(
        ranges.length === 0
          ? "No silences found"
          : `Found ${ranges.length} silence${ranges.length === 1 ? "" : "s"}`,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setDetectingSilence(false);
    }
  }, [project, activeSourceIndex, flash]);

  const resetCuts = useCallback(() => {
    if (!project) return;
    const fullSpans = project.sources.map((s, i) => ({
      sourceIndex: i,
      startSec: 0,
      endSec: s.durationSec,
    }));
    setProject({ ...project, segments: fullSpans });
    setInPoint(null);
    setOutPoint(null);
    setSilences([]);
    flash("Reset cuts");
  }, [project, flash]);

  const cutAllSilences = useCallback(() => {
    if (!project || silences.length === 0) return;
    let next = project.segments;
    for (const s of silences) {
      next = cutRange(next, activeSourceIndex, s.startSec, s.endSec);
    }
    setProject({ ...project, segments: next });
    const count = silences.length;
    setSilences([]);
    setInPoint(null);
    setOutPoint(null);
    flash(`Cut ${count} silence${count === 1 ? "" : "s"}`);
  }, [project, silences, activeSourceIndex, flash]);

  const appendClipAtPath = useCallback(
    async (path: string) => {
      if (!project) return;
      setAppending(true);
      try {
        const probe = await api.probeVideo(path);
        const newIndex = project.sources.length;
        const primary = project.sources[0];
        if (primary && probe.codecInfo !== primary.codecInfo) {
          const proceed = window.confirm(
            `Codec mismatch — lossless concat may fail.\n\nPrimary: ${primary.codecInfo}\nAppended: ${probe.codecInfo}\n\nAppend anyway?`,
          );
          if (!proceed) return;
        }

        setProject({
          ...project,
          sources: [
            ...project.sources,
            { path, durationSec: probe.durationSec, codecInfo: probe.codecInfo },
          ],
          segments: [
            ...project.segments,
            { sourceIndex: newIndex, startSec: 0, endSec: probe.durationSec },
          ],
        });
        flash(`Appended ${path.split("/").pop() ?? "clip"}`);
      } catch (e) {
        setError(String(e));
      } finally {
        setAppending(false);
      }
    },
    [project, flash],
  );

  const removeSource = useCallback(
    (index: number) => {
      if (!project) return;
      if (index === 0) return;
      const src = project.sources[index];
      if (!src) return;

      const segs = project.segments.filter((s) => s.sourceIndex === index);
      const isPristine =
        segs.length === 1 &&
        segs[0].startSec === 0 &&
        segs[0].endSec === src.durationSec;
      if (!isPristine) {
        const ok = window.confirm(
          `Remove "${src.path.split("/").pop()}"?\n\nIts cuts will be discarded.`,
        );
        if (!ok) return;
      }

      const newSources = project.sources.filter((_, i) => i !== index);
      const newSegments = project.segments
        .filter((s) => s.sourceIndex !== index)
        .map((s) =>
          s.sourceIndex > index ? { ...s, sourceIndex: s.sourceIndex - 1 } : s,
        );

      setProject({ ...project, sources: newSources, segments: newSegments });
      setActiveSourceIndex((cur) => {
        if (cur === index) return 0;
        if (cur > index) return cur - 1;
        return cur;
      });
      setInPoint(null);
      setOutPoint(null);
      setSilences([]);
      setSourceTime(0);
      flash(`Removed ${src.path.split("/").pop() ?? "clip"}`);
    },
    [project, flash],
  );

  const appendClip = useCallback(async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const chosen = await open({
      title: "Append clip",
      multiple: false,
      filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "m4v"] }],
    });
    if (!chosen || typeof chosen !== "string") return;
    await appendClipAtPath(chosen);
  }, [appendClipAtPath]);

  const onDropped = useCallback(
    async (paths: string[]) => {
      for (const p of paths) {
        await appendClipAtPath(p);
      }
    },
    [appendClipAtPath],
  );
  const hovering = useFileDrop(onDropped);

  const transcribe = useCallback(async () => {
    if (!project) return;
    setTranscribing(true);
    try {
      const result = await api.transcribeSource(project.sources[0].path, 0);
      setProject((p) => (p ? { ...p, transcript: result } : p));
      flash(`Transcribed ${result.segments.length} segments`);

      try {
        const settings = await api.getSettings();
        const text = result.segments.map((s) => s.text).join(" ");
        const suggestion = await suggestFilename(text, settings.llmProvider);
        if (suggestion) {
          setProject((p) => (p ? { ...p, suggestedFilename: suggestion } : p));
        }
      } catch (e) {
        console.warn("filename suggestion failed:", e);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setTranscribing(false);
    }
  }, [project, flash]);

  const acceptRename = useCallback(
    async (stem: string) => {
      if (!project) return;
      const cleaned = stem.trim();
      if (!cleaned) return;
      setRenaming(true);
      try {
        const { newPath } = await api.renameSource(currentPath, cleaned);
        setProject((p) =>
          p
            ? {
                ...p,
                sources: p.sources.map((s, i) =>
                  i === 0 ? { ...s, path: newPath } : s,
                ),
                suggestedFilename: undefined,
              }
            : p,
        );
        setCurrentPath(newPath);
        flash(`Renamed to ${cleaned}`);
      } catch (e) {
        setError(String(e));
      } finally {
        setRenaming(false);
      }
    },
    [project, currentPath, flash],
  );

  const dismissSuggestion = useCallback(() => {
    setProject((p) => (p ? { ...p, suggestedFilename: undefined } : p));
  }, []);

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

      const outStem = chosen.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "edit";
      let transcriptMsg = "";
      if (project.transcript) {
        const settings = await api.getSettings();
        if (settings.vaultFolder) {
          const remapped = remapTranscriptToEdited(project.transcript, project.segments);
          await api.writeObsidianNote({
            vaultFolder: settings.vaultFolder,
            filenameStem: outStem,
            sourcePath: project.sources[project.transcript.sourceIndex].path,
            title: outStem,
            segments: remapped.map((s) => ({ text: s.text })),
          });
          transcriptMsg = " + note";
        } else {
          transcriptMsg = " (vault not set)";
        }
      }

      flash(`Exported: ${formatTime(result.durationSec)}${transcriptMsg}`);
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
    return sourceToEdited(project.segments, activeSourceIndex, sourceTime) ?? 0;
  }, [project, activeSourceIndex, sourceTime]);

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

  const transcript = project.transcript ?? null;
  const transcriptActive =
    transcript !== null && transcript.sourceIndex === activeSourceIndex;
  const transcriptSourceLabel = transcript
    ? project.sources[transcript.sourceIndex]?.path.split("/").pop()
    : undefined;

  const seekInTranscript = (sec: number) => {
    if (!transcript) return;
    if (transcript.sourceIndex !== activeSourceIndex) {
      setActiveSourceIndex(transcript.sourceIndex);
      setInPoint(null);
      setOutPoint(null);
      setSilences([]);
    }
    setSourceTime(sec);
  };

  const currentStem =
    source.path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";

  return (
    <div className="flex h-full flex-col">
      <FilenameBar
        currentStem={currentStem}
        suggestion={project.suggestedFilename ?? null}
        renaming={renaming}
        onAccept={acceptRename}
        onDismiss={dismissSuggestion}
        onBack={onClose}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <VideoPlayer
            sources={project.sources}
            activeSourceIndex={activeSourceIndex}
            segments={project.segments}
            sourceTime={sourceTime}
            isPlaying={isPlaying}
            onSourceTimeChange={setSourceTime}
            onActiveSourceChange={(index, sec) => {
              setActiveSourceIndex(index);
              setSourceTime(sec);
            }}
            onPlayingChange={setIsPlaying}
            onEnded={() => setIsPlaying(false)}
          />
        </div>
        <aside className="w-80 shrink-0 overflow-hidden border-l border-border bg-bg-raised">
          <Transcript
            transcript={transcript}
            sourceTime={sourceTime}
            onSeek={seekInTranscript}
            busy={transcribing}
            onTranscribe={transcribe}
            transcriptActive={transcriptActive}
            transcriptSourceLabel={transcriptSourceLabel}
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
        onResetCuts={resetCuts}
        onExport={exportEdit}
        onDetectSilence={detectSilence}
        onCutAllSilences={cutAllSilences}
        onAppendClip={appendClip}
        appending={appending}
        canCut={canCut}
        exporting={exporting}
        detectingSilence={detectingSilence}
        silenceCount={silences.length}
        segments={project.segments}
        sourceDuration={duration}
      />

      <Timeline
        sources={project.sources}
        activeSourceIndex={activeSourceIndex}
        segments={project.segments}
        playheadSec={sourceTime}
        inPoint={inPoint}
        outPoint={outPoint}
        silences={silences}
        onScrub={seek}
        onSelectSource={selectSource}
        onRemoveSource={removeSource}
      />

      {hovering && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/10 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-accent bg-bg-raised/80 px-8 py-6 text-lg font-medium text-accent">
            Drop to append clip
          </div>
        </div>
      )}

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

function FilenameBar({
  currentStem,
  suggestion,
  renaming,
  onAccept,
  onDismiss,
  onBack,
}: {
  currentStem: string;
  suggestion: string | null;
  renaming: boolean;
  onAccept: (stem: string) => void;
  onDismiss: () => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(suggestion ?? "");

  useEffect(() => {
    setDraft(suggestion ?? "");
  }, [suggestion]);

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border bg-bg-raised px-4 py-2">
      <button
        onClick={onBack}
        className="rounded-md px-2 py-1 text-xs text-text-dim hover:bg-bg-elevated hover:text-text"
        title="Back to Home"
      >
        ←
      </button>
      <div className="font-mono text-sm text-text-dim">{currentStem}</div>

      {suggestion && (
        <div className="flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-2 py-1">
          <span className="text-[11px] uppercase tracking-wide text-accent">
            Rename to
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAccept(draft);
              if (e.key === "Escape") onDismiss();
            }}
            disabled={renaming}
            className="w-64 rounded border border-border bg-bg px-2 py-0.5 font-mono text-xs text-text outline-none focus:border-accent"
          />
          <button
            onClick={() => onAccept(draft)}
            disabled={renaming || !draft.trim()}
            className="rounded bg-accent px-2 py-0.5 text-xs font-medium text-black hover:bg-accent-hover disabled:opacity-50"
          >
            {renaming ? "Renaming…" : "Accept"}
          </button>
          <button
            onClick={onDismiss}
            disabled={renaming}
            className="rounded px-1.5 py-0.5 text-xs text-text-dim hover:bg-bg-elevated hover:text-text"
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
