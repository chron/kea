use crate::ffmpeg;
use serde::Serialize;
use std::process::Command;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SilenceRange {
    pub start_sec: f64,
    pub end_sec: f64,
}

#[tauri::command]
pub fn detect_silence(
    source_path: String,
    threshold_db: i32,
    min_sec: f32,
) -> Result<Vec<SilenceRange>, String> {
    let ffmpeg_bin = ffmpeg::ffmpeg_path().ok_or_else(|| "ffmpeg not found on PATH".to_string())?;
    let filter = format!("silencedetect=noise={}dB:d={}", threshold_db, min_sec);
    let output = Command::new(&ffmpeg_bin)
        .args([
            "-hide_banner",
            "-nostats",
            "-i",
            &source_path,
            "-af",
            &filter,
            "-f",
            "null",
            "-",
        ])
        .output()
        .map_err(|e| format!("failed to spawn ffmpeg: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg silencedetect failed: {}", err.trim()));
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let mut ranges: Vec<SilenceRange> = Vec::new();
    let mut current_start: Option<f64> = None;

    for line in stderr.lines() {
        if let Some(idx) = line.find("silence_start:") {
            let rest = line[idx + "silence_start:".len()..].trim();
            let token = rest.split_whitespace().next().unwrap_or("");
            if let Ok(v) = token.parse::<f64>() {
                current_start = Some(v.max(0.0));
            }
        } else if let Some(idx) = line.find("silence_end:") {
            let rest = line[idx + "silence_end:".len()..].trim();
            let token = rest.split_whitespace().next().unwrap_or("");
            if let Ok(end) = token.parse::<f64>() {
                if let Some(start) = current_start.take() {
                    if end > start {
                        ranges.push(SilenceRange {
                            start_sec: start,
                            end_sec: end,
                        });
                    }
                }
            }
        }
    }

    Ok(ranges)
}
