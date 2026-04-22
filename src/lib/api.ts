import { invoke } from "@tauri-apps/api/core";
import type {
  LlmProvider,
  MovieEntry,
  ProbeResult,
  Project,
  RecentProject,
  Settings,
  SilenceRange,
  Transcript,
} from "./types";

export const api = {
  listMoviesVideos: () => invoke<MovieEntry[]>("list_movies_videos"),
  probeVideo: (path: string) => invoke<ProbeResult>("probe_video", { path }),
  ffmpegAvailable: () => invoke<boolean>("ffmpeg_available"),
  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  setApiKey: (provider: LlmProvider, key: string) =>
    invoke<void>("set_api_key", { provider, key }),
  getApiKey: (provider: LlmProvider) =>
    invoke<string | null>("get_api_key", { provider }),
  hasApiKey: (provider: LlmProvider) => invoke<boolean>("has_api_key", { provider }),
  loadProjectByPath: (videoPath: string) =>
    invoke<Project | null>("load_project_by_path", { videoPath }),
  saveProject: (videoPath: string, project: Project) =>
    invoke<void>("save_project", { videoPath, project }),
  listRecentProjects: () => invoke<RecentProject[]>("list_recent_projects"),
  exportEdit: (request: ExportRequest) =>
    invoke<ExportResult>("export_edit", { request }),
  transcribeSource: (sourcePath: string, sourceIndex: number) =>
    invoke<Transcript>("transcribe_source", { sourcePath, sourceIndex }),
  writeObsidianNote: (request: ObsidianNoteRequest) =>
    invoke<string>("write_obsidian_note", { request }),
  detectSilence: (sourcePath: string, thresholdDb: number, minSec: number) =>
    invoke<SilenceRange[]>("detect_silence", { sourcePath, thresholdDb, minSec }),
  renameSource: (oldPath: string, newStem: string) =>
    invoke<RenameResult>("rename_source", { oldPath, newStem }),
};

export type RenameResult = {
  newPath: string;
};

export type ObsidianTranscriptSegment = {
  text: string;
};

export type ObsidianNoteRequest = {
  vaultFolder: string;
  filenameStem: string;
  sourcePath: string;
  title: string;
  segments: ObsidianTranscriptSegment[];
};

export type ExportSegment = {
  sourcePath: string;
  startSec: number;
  endSec: number;
};

export type ExportRequest = {
  segments: ExportSegment[];
  outputPath: string;
};

export type ExportResult = {
  outputPath: string;
  durationSec: number;
};
