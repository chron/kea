use crate::{ffmpeg, paths};
use serde::Serialize;
use std::fs;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovieEntry {
    pub path: String,
    pub name: String,
    pub modified_ms: u128,
    pub size_bytes: u64,
}

#[tauri::command]
pub fn list_movies_videos() -> Result<Vec<MovieEntry>, String> {
    let dir = paths::movies_dir().map_err(|e| e.to_string())?;
    let exts = ["mp4", "mov", "mkv", "m4v", "webm"];
    let mut out: Vec<MovieEntry> = Vec::new();

    let read = match fs::read_dir(&dir) {
        Ok(r) => r,
        Err(_) => return Ok(out),
    };

    for entry in read {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(ext) = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_ascii_lowercase())
        else {
            continue;
        };
        if !exts.contains(&ext.as_str()) {
            continue;
        }
        let Ok(metadata) = entry.metadata() else { continue };
        let modified_ms = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis())
            .unwrap_or(0);
        out.push(MovieEntry {
            path: path.to_string_lossy().into_owned(),
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            modified_ms,
            size_bytes: metadata.len(),
        });
    }
    out.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(out)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub duration_sec: f64,
    pub codec_info: String,
}

#[tauri::command]
pub fn probe_video(path: String) -> Result<ProbeResult, String> {
    let (duration_sec, codec_info) = ffmpeg::probe(&path).map_err(|e| e.to_string())?;
    Ok(ProbeResult {
        duration_sec,
        codec_info,
    })
}

#[tauri::command]
pub fn ffmpeg_available() -> bool {
    ffmpeg::is_available()
}
