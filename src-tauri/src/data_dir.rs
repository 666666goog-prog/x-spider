use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataDirInfo {
    data_dir: String,
    portable: bool,
}

fn copy_if_missing(src: &Path, dst: &Path) {
    if src.is_file() && !dst.exists() {
        if let Some(parent) = dst.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::copy(src, dst);
    }
}

/// Copy the files an older run left in the system app-data dir into the
/// portable data dir (settings/app-state JSON files and the saved
/// account cookies), so nothing is lost once portable detection works.
fn migrate_from_app_data(app_data_dir: &Path, data_dir: &Path) {
    if let Ok(entries) = std::fs::read_dir(app_data_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name();
            if path.is_file() && name.to_string_lossy().to_lowercase().ends_with(".json") {
                copy_if_missing(&path, &data_dir.join(&name));
            }
        }
    }
    let src_accounts = app_data_dir.join("accounts");
    if let Ok(entries) = std::fs::read_dir(&src_accounts) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name();
            if path.is_file() {
                copy_if_missing(&path, &data_dir.join("accounts").join(&name));
            }
        }
    }
}

/// Decide where the app's data lives. This check is done in Rust on
/// purpose: the frontend path API reported a wrong executable location
/// on the user's machine, so every portable build silently stored its
/// data in the system app-data dir instead of next to the exe.
/// std::env::current_exe does not have that problem. In portable mode
/// the data dir and its accounts folder are created immediately, so
/// the user can see them next to the exe right after starting the app.
#[tauri::command]
pub fn get_data_dir_info(app: AppHandle) -> DataDirInfo {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.to_path_buf()));
    let portable = exe_dir
        .as_ref()
        .map(|dir| dir.join("portable.txt").is_file())
        .unwrap_or(false);

    let app_data_dir = app.path_resolver().app_data_dir();
    let data_dir: PathBuf = if portable {
        exe_dir
            .clone()
            .map(|dir| dir.join("data"))
            .unwrap_or_else(|| app_data_dir.clone().unwrap_or_default())
    } else {
        app_data_dir.clone().unwrap_or_default()
    };

    if portable {
        let _ = std::fs::create_dir_all(data_dir.join("accounts"));
        if let Some(app_data) = app_data_dir.as_ref() {
            if app_data != &data_dir {
                migrate_from_app_data(app_data, &data_dir);
            }
        }
    }

    DataDirInfo {
        data_dir: data_dir.to_string_lossy().into_owned(),
        portable,
    }
}
