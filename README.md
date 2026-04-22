# Kea

A personal video editor for OBS screencasts. Built for a narrow workflow: cut the boring bits from a one-take recording, optionally splice two clips, transcribe with Whisper, and drop a markdown note into an Obsidian vault.

Tauri 2 + React 19 + TypeScript on the front, Rust + ffmpeg on the back. Runs on macOS.

## What it does

- **Lossless cuts.** Keyframe-accurate, `-c copy` via ffmpeg's concat demuxer. No re-encode, no quality loss.
- **Splice.** Append a second clip and trim/cut across both in one timeline.
- **Transcribe.** OpenAI Whisper (`verbose_json`). Scrollable transcript, click-to-seek, live highlight.
- **Auto silence detection.** `silencedetect` filter with sane voice defaults; one-click cut-all.
- **LLM filename suggestion.** After transcription, `gpt-5.4-mini` (or Anthropic if you prefer) proposes a kebab-case name.
- **Obsidian export.** Writes `YYYY-MM-DD-<name>.md` to a configured vault folder with remapped timestamps.
- **Finder drag-drop.** Drop a file on Home to open it; drop on the editor to append.

## Requirements

- macOS
- [ffmpeg](https://ffmpeg.org/) on `PATH` (`brew install ffmpeg`)
- Node.js (via `nvm use`), pnpm
- Rust toolchain

## Run it

```bash
nvm use
pnpm install
pnpm tauri dev
```

API keys (OpenAI, Anthropic) and the Obsidian vault folder are set in Settings — keys are stored in the macOS Keychain.

## Layout

```
src/            React app (editor, timeline, transcript, player)
src/lib/        Timeline math, Tauri `invoke` wrappers, LLM adapter
src-tauri/src/  Rust commands: ffmpeg, export, transcribe, silence, project, settings
```

Projects are JSON files in `~/Library/Application Support/Kea/projects/`, keyed by a hash of the source video's path. `~/Movies` stays pure video — Kea never writes sidecars there.

## Keyboard

| Key | Action |
| --- | --- |
| Space | Play/pause |
| ←/→ | Step 1s (hold shift for 5s) |
| Home/End | Jump to start/end of kept range |
| I / O | Mark in / out |
| Esc | Clear markers |
| Backspace / Delete | Cut selection |
| ⌘E | Export |
