mod commands;
mod ffmpeg;
mod paths;

use commands::{export, project, settings, transcribe, video};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            video::list_movies_videos,
            video::probe_video,
            video::ffmpeg_available,
            settings::get_settings,
            settings::save_settings,
            settings::set_api_key,
            settings::get_api_key,
            settings::has_api_key,
            project::load_project_by_path,
            project::save_project,
            project::list_recent_projects,
            export::export_edit,
            transcribe::transcribe_source,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
