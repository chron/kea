use crate::{ffmpeg, paths};
use serde::{Deserialize, Serialize};
use std::fs;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSegment {
    pub source_path: String,
    pub start_sec: f64,
    pub end_sec: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub segments: Vec<ExportSegment>,
    pub output_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub output_path: String,
    pub duration_sec: f64,
}

fn make_tmp_dir() -> Result<std::path::PathBuf, String> {
    let base = paths::app_data_dir().map_err(|e| e.to_string())?.join("tmp");
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dir = base.join(format!("export-{}", ms));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub async fn export_edit(request: ExportRequest) -> Result<ExportResult, String> {
    if request.segments.is_empty() {
        return Err("No segments to export".into());
    }

    let ffmpeg_bin = ffmpeg::ffmpeg_path().ok_or_else(|| "ffmpeg not found on PATH".to_string())?;
    let tmp_dir = make_tmp_dir()?;

    // Fast path: single contiguous segment → use -ss/-to + -c copy directly into output.
    let mut chunk_paths: Vec<std::path::PathBuf> = Vec::new();

    for (i, seg) in request.segments.iter().enumerate() {
        let ext = std::path::Path::new(&seg.source_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("mp4");
        let chunk_path = tmp_dir.join(format!("chunk_{:04}.{}", i, ext));

        let duration = (seg.end_sec - seg.start_sec).max(0.0);
        let output = Command::new(&ffmpeg_bin)
            .args([
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                &format!("{:.3}", seg.start_sec),
                "-i",
                &seg.source_path,
                "-t",
                &format!("{:.3}", duration),
                "-c",
                "copy",
                "-avoid_negative_ts",
                "make_zero",
                "-map",
                "0",
                chunk_path.to_str().unwrap(),
            ])
            .output()
            .map_err(|e| format!("failed to spawn ffmpeg: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            let _ = fs::remove_dir_all(&tmp_dir);
            return Err(format!("ffmpeg chunk {} failed: {}", i, err.trim()));
        }
        chunk_paths.push(chunk_path);
    }

    // If only one chunk, just move/copy it to the output path.
    if chunk_paths.len() == 1 {
        let src = &chunk_paths[0];
        let dst = std::path::Path::new(&request.output_path);
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent).ok();
        }
        fs::rename(src, dst)
            .or_else(|_| fs::copy(src, dst).map(|_| ()))
            .map_err(|e| format!("failed to write output: {}", e))?;
    } else {
        // Write concat list file.
        let concat_list = tmp_dir.join("list.txt");
        let body: String = chunk_paths
            .iter()
            .map(|p| {
                let s = p.to_string_lossy();
                // Escape single quotes for the ffmpeg concat demuxer.
                let escaped = s.replace('\'', "'\\''");
                format!("file '{}'", escaped)
            })
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(&concat_list, body).map_err(|e| e.to_string())?;

        let output = Command::new(&ffmpeg_bin)
            .args([
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                concat_list.to_str().unwrap(),
                "-c",
                "copy",
                &request.output_path,
            ])
            .output()
            .map_err(|e| format!("failed to spawn ffmpeg: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            let _ = fs::remove_dir_all(&tmp_dir);
            return Err(format!("ffmpeg concat failed: {}", err.trim()));
        }
    }

    let _ = fs::remove_dir_all(&tmp_dir);

    let (duration_sec, _) = ffmpeg::probe(&request.output_path).unwrap_or((0.0, String::new()));

    Ok(ExportResult {
        output_path: request.output_path,
        duration_sec,
    })
}
