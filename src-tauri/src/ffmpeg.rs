use anyhow::{Context, Result};
use std::path::Path;
use std::process::Command;

// macOS GUI apps launched from Finder get a minimal PATH that excludes
// Homebrew's bin dirs, so `which` alone isn't enough — probe common
// install locations too.
const FALLBACK_DIRS: &[&str] = &[
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/opt/local/bin",
];

fn resolve(bin: &str) -> Option<String> {
    let via_which = Command::new("/usr/bin/env")
        .args(["which", bin])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if via_which.is_some() {
        return via_which;
    }
    for dir in FALLBACK_DIRS {
        let candidate = format!("{dir}/{bin}");
        if Path::new(&candidate).is_file() {
            return Some(candidate);
        }
    }
    None
}

pub fn ffmpeg_path() -> Option<String> {
    resolve("ffmpeg")
}

pub fn ffprobe_path() -> Option<String> {
    resolve("ffprobe")
}

pub fn is_available() -> bool {
    ffmpeg_path().is_some() && ffprobe_path().is_some()
}

pub fn probe(path: &str) -> Result<(f64, String)> {
    let ffprobe = ffprobe_path().context("ffprobe not found on PATH")?;
    let output = Command::new(&ffprobe)
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_name,codec_type,width,height,r_frame_rate",
            "-of",
            "default=noprint_wrappers=1",
            path,
        ])
        .output()
        .context("failed to run ffprobe")?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("ffprobe failed: {}", err);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut duration: f64 = 0.0;
    let mut info_lines: Vec<String> = Vec::new();
    for line in stdout.lines() {
        if let Some(d) = line.strip_prefix("duration=") {
            duration = d.parse().unwrap_or(0.0);
        } else if !line.is_empty() {
            info_lines.push(line.to_string());
        }
    }
    Ok((duration, info_lines.join(", ")))
}
