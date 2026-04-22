use chrono::{DateTime, Local};
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObsidianTranscriptSegment {
    pub text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObsidianNoteRequest {
    pub vault_folder: String,
    pub filename_stem: String,
    pub source_path: String,
    pub title: String,
    pub segments: Vec<ObsidianTranscriptSegment>,
}

fn sanitize_stem(stem: &str) -> String {
    stem.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            _ => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

#[tauri::command]
pub fn write_obsidian_note(request: ObsidianNoteRequest) -> Result<String, String> {
    let vault = PathBuf::from(&request.vault_folder);
    if !vault.is_dir() {
        return Err(format!(
            "Vault folder does not exist: {}",
            request.vault_folder
        ));
    }

    let mtime: DateTime<Local> = fs::metadata(&request.source_path)
        .and_then(|m| m.modified())
        .map(DateTime::<Local>::from)
        .unwrap_or_else(|_| Local::now());
    let date_prefix = mtime.format("%Y-%m-%d").to_string();

    let stem = sanitize_stem(&request.filename_stem);
    let filename = format!("{}-{}.md", date_prefix, stem);
    let out_path = vault.join(&filename);

    let source_filename = Path::new(&request.source_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");

    let mut body = String::new();
    body.push_str(&format!("# {}\n\n", request.title));
    body.push_str(&format!("Recorded: {}\n", date_prefix));
    body.push_str(&format!("Source: {}\n\n", source_filename));
    body.push_str("## Transcript\n\n");
    for seg in &request.segments {
        let text = seg.text.trim();
        if text.is_empty() {
            continue;
        }
        body.push_str(text);
        body.push_str("\n\n");
    }

    fs::write(&out_path, body).map_err(|e| format!("failed to write markdown: {}", e))?;
    Ok(out_path.to_string_lossy().into_owned())
}
