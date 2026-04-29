mod commands;

use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::write_file,
            commands::read_dir_tree,
            commands::create_file,
            commands::create_dir,
            commands::delete_path,
            commands::rename_path,
            commands::path_exists,
            commands::get_file_info,
            commands::execute_command,
            commands::execute_command_stream,
            commands::execute_curl,
            commands::save_session,
            commands::load_session,
            commands::exit_app,
            commands::reveal_in_finder,
            commands::shell_exec,
            commands::read_file_base64,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
                let _ = app.emit("exit-requested", ());
            }
        });
}
