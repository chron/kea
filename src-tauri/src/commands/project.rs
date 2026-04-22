use crate::paths;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub path: String,
    pub duration_sec: f64,
    pub codec_info: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub source_index: usize,
    pub start_sec: f64,
    pub end_sec: f64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptSegment {
    pub start_sec: f64,
    pub end_sec: f64,
    pub text: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    pub source_index: usize,
    pub segments: Vec<TranscriptSegment>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub version: u32,
    pub sources: Vec<SourceInfo>,
    pub segments: Vec<Segment>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub transcript: Option<Transcript>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub suggested_filename: Option<String>,
}

#[tauri::command]
pub fn load_project_by_path(video_path: String) -> Result<Option<Project>, String> {
    let p = paths::project_path_for(&video_path).map_err(|e| e.to_string())?;
    if !p.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let project: Project = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(Some(project))
}

#[tauri::command]
pub fn save_project(video_path: String, project: Project) -> Result<(), String> {
    let p = paths::project_path_for(&video_path).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
    fs::write(&p, text).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentProject {
    pub project: Project,
    pub modified_ms: u128,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameResult {
    pub new_path: String,
}

#[tauri::command]
pub fn rename_source(old_path: String, new_stem: String) -> Result<RenameResult, String> {
    let trimmed = new_stem.trim();
    if trimmed.is_empty() {
        return Err("filename is empty".into());
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains('\0') {
        return Err("filename contains invalid characters".into());
    }

    let old = Path::new(&old_path);
    let parent = old
        .parent()
        .ok_or_else(|| "source has no parent directory".to_string())?;
    let ext = old
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4");

    let new_path = parent.join(format!("{}.{}", trimmed, ext));
    if new_path.exists() {
        return Err(format!(
            "a file already exists at {}",
            new_path.display()
        ));
    }

    let old_project_path = paths::project_path_for(&old_path).map_err(|e| e.to_string())?;
    let project_text = fs::read_to_string(&old_project_path)
        .map_err(|e| format!("could not read project: {}", e))?;
    let mut project: Project =
        serde_json::from_str(&project_text).map_err(|e| format!("corrupt project: {}", e))?;

    fs::rename(old, &new_path).map_err(|e| format!("rename failed: {}", e))?;

    let new_path_str = new_path.to_string_lossy().to_string();
    if let Some(src) = project.sources.get_mut(0) {
        src.path = new_path_str.clone();
    }
    project.suggested_filename = None;

    let new_project_path =
        paths::project_path_for(&new_path_str).map_err(|e| e.to_string())?;
    let out = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
    fs::write(&new_project_path, out).map_err(|e| e.to_string())?;
    if new_project_path != old_project_path {
        let _ = fs::remove_file(&old_project_path);
    }

    Ok(RenameResult {
        new_path: new_path_str,
    })
}

#[tauri::command]
pub fn list_recent_projects() -> Result<Vec<RecentProject>, String> {
    let dir = paths::projects_dir().map_err(|e| e.to_string())?;
    let mut items: Vec<RecentProject> = Vec::new();
    let read = match fs::read_dir(&dir) {
        Ok(r) => r,
        Err(_) => return Ok(items),
    };
    for entry in read {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(metadata) = entry.metadata() else { continue };
        let modified_ms = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let Ok(text) = fs::read_to_string(&path) else { continue };
        let Ok(project) = serde_json::from_str::<Project>(&text) else { continue };
        items.push(RecentProject {
            project,
            modified_ms,
        });
    }
    items.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(items)
}
