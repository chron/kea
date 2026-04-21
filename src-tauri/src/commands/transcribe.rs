use crate::{commands::settings, ffmpeg, paths};
use reqwest::multipart::{Form, Part};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const WHISPER_MAX_BYTES: u64 = 25 * 1024 * 1024;
const WHISPER_URL: &str = "https://api.openai.com/v1/audio/transcriptions";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptSegment {
    pub start_sec: f64,
    pub end_sec: f64,
    pub text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    pub source_index: u32,
    pub segments: Vec<TranscriptSegment>,
}

#[derive(Deserialize)]
struct WhisperSegment {
    start: f64,
    end: f64,
    text: String,
}

#[derive(Deserialize)]
struct WhisperResponse {
    segments: Vec<WhisperSegment>,
}

fn make_tmp_dir() -> Result<PathBuf, String> {
    let base = paths::app_data_dir().map_err(|e| e.to_string())?.join("tmp");
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dir = base.join(format!("transcribe-{}", ms));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn extract_mono_mp3(src: &str, dst: &PathBuf) -> Result<(), String> {
    let ffmpeg_bin = ffmpeg::ffmpeg_path().ok_or_else(|| "ffmpeg not found on PATH".to_string())?;
    let output = Command::new(&ffmpeg_bin)
        .args([
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            src,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-b:a",
            "48k",
            "-c:a",
            "libmp3lame",
            dst.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("failed to spawn ffmpeg: {}", e))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg audio extract failed: {}", err.trim()));
    }
    Ok(())
}

#[tauri::command]
pub async fn transcribe_source(source_path: String, source_index: u32) -> Result<Transcript, String> {
    let api_key = settings::get_api_key("openai".into())?
        .ok_or_else(|| "No OpenAI API key set. Add one in Settings.".to_string())?;

    let src_size = fs::metadata(&source_path)
        .map_err(|e| format!("failed to stat source: {}", e))?
        .len();

    let tmp_dir = make_tmp_dir()?;
    let (upload_path, filename, mime) = if src_size > WHISPER_MAX_BYTES {
        let mp3 = tmp_dir.join("audio.mp3");
        extract_mono_mp3(&source_path, &mp3)?;
        (mp3.to_string_lossy().to_string(), "audio.mp3".to_string(), "audio/mpeg")
    } else {
        let ext = std::path::Path::new(&source_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("mp4");
        let mime = match ext {
            "mp3" => "audio/mpeg",
            "wav" => "audio/wav",
            "m4a" | "mp4" | "m4v" => "video/mp4",
            "mov" => "video/quicktime",
            "mkv" => "video/x-matroska",
            "webm" => "video/webm",
            _ => "application/octet-stream",
        };
        (
            source_path.clone(),
            format!("audio.{}", ext),
            mime,
        )
    };

    let bytes = fs::read(&upload_path).map_err(|e| format!("failed to read upload: {}", e))?;
    let part = Part::bytes(bytes)
        .file_name(filename)
        .mime_str(mime)
        .map_err(|e| e.to_string())?;
    let form = Form::new()
        .part("file", part)
        .text("model", "whisper-1")
        .text("response_format", "verbose_json");

    let client = reqwest::Client::new();
    let resp = client
        .post(WHISPER_URL)
        .bearer_auth(&api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("whisper request failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        let _ = fs::remove_dir_all(&tmp_dir);
        return Err(format!("whisper {}: {}", status, body));
    }

    let parsed: WhisperResponse = resp
        .json()
        .await
        .map_err(|e| format!("whisper response parse failed: {}", e))?;

    let _ = fs::remove_dir_all(&tmp_dir);

    Ok(Transcript {
        source_index,
        segments: parsed
            .segments
            .into_iter()
            .map(|s| TranscriptSegment {
                start_sec: s.start,
                end_sec: s.end,
                text: s.text.trim().to_string(),
            })
            .collect(),
    })
}
