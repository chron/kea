use crate::paths;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::fs;

const SERVICE: &str = "com.paul.kea";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub vault_folder: Option<String>,
    #[serde(default = "default_provider")]
    pub llm_provider: String,
    #[serde(default = "default_silence_threshold")]
    pub silence_threshold_db: i32,
    #[serde(default = "default_silence_min_sec")]
    pub silence_min_sec: f32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            vault_folder: None,
            llm_provider: default_provider(),
            silence_threshold_db: default_silence_threshold(),
            silence_min_sec: default_silence_min_sec(),
        }
    }
}

fn default_provider() -> String {
    "openai".into()
}
fn default_silence_threshold() -> i32 {
    -45
}
fn default_silence_min_sec() -> f32 {
    1.5
}

fn load_from_disk() -> Settings {
    if let Ok(path) = paths::settings_path() {
        if let Ok(text) = fs::read_to_string(&path) {
            if let Ok(s) = serde_json::from_str::<Settings>(&text) {
                return s;
            }
        }
    }
    Settings::default()
}

#[tauri::command]
pub fn get_settings() -> Settings {
    load_from_disk()
}

#[tauri::command]
pub fn save_settings(settings: Settings) -> Result<(), String> {
    let path = paths::settings_path().map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())
}

fn keyring_entry(provider: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, &format!("api_key:{}", provider)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_api_key(provider: String, key: String) -> Result<(), String> {
    let entry = keyring_entry(&provider)?;
    if key.is_empty() {
        return entry.delete_credential().or_else(|e| match e {
            keyring::Error::NoEntry => Ok(()),
            other => Err(other.to_string()),
        });
    }
    entry.set_password(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_api_key(provider: String) -> Result<Option<String>, String> {
    match keyring_entry(&provider)?.get_password() {
        Ok(k) => Ok(Some(k)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn has_api_key(provider: String) -> Result<bool, String> {
    match keyring_entry(&provider)?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}
