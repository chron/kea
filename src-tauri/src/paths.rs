use anyhow::{Context, Result};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

pub fn home_dir() -> Result<PathBuf> {
    std::env::var("HOME")
        .map(PathBuf::from)
        .context("HOME not set")
}

pub fn movies_dir() -> Result<PathBuf> {
    Ok(home_dir()?.join("Movies"))
}

pub fn app_data_dir() -> Result<PathBuf> {
    let dir = home_dir()?.join("Library/Application Support/Kea");
    std::fs::create_dir_all(&dir).ok();
    Ok(dir)
}

pub fn projects_dir() -> Result<PathBuf> {
    let d = app_data_dir()?.join("projects");
    std::fs::create_dir_all(&d).ok();
    Ok(d)
}

pub fn settings_path() -> Result<PathBuf> {
    Ok(app_data_dir()?.join("settings.json"))
}

pub fn project_path_for(video_path: &str) -> Result<PathBuf> {
    let mut hasher = Sha256::new();
    hasher.update(video_path.as_bytes());
    let hash = hasher.finalize();
    let hex_str = hex::encode(&hash[..8]);
    Ok(projects_dir()?.join(format!("{}.json", hex_str)))
}
