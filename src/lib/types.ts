export type SourceInfo = {
  path: string;
  durationSec: number;
  codecInfo: string;
};

export type Segment = {
  sourceIndex: number;
  startSec: number;
  endSec: number;
};

export type TranscriptSegment = {
  startSec: number;
  endSec: number;
  text: string;
};

export type Transcript = {
  sourceIndex: number;
  segments: TranscriptSegment[];
};

export type Project = {
  version: 1;
  sources: SourceInfo[];
  segments: Segment[];
  transcript?: Transcript;
  suggestedFilename?: string;
};

export type MovieEntry = {
  path: string;
  name: string;
  modifiedMs: number;
  sizeBytes: number;
};

export type RecentProject = {
  project: Project;
  modifiedMs: number;
};

export type LlmProvider = "openai" | "anthropic";

export type Settings = {
  vaultFolder: string | null;
  llmProvider: LlmProvider;
  silenceThresholdDb: number;
  silenceMinSec: number;
};

export type ProbeResult = {
  durationSec: number;
  codecInfo: string;
};

export type SilenceRange = {
  startSec: number;
  endSec: number;
};
