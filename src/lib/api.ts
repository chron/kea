import { invoke } from "@tauri-apps/api/core";
import type {
  LlmProvider,
  MovieEntry,
  ProbeResult,
  Project,
  RecentProject,
  Settings,
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
