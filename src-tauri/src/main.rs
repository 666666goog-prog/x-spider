// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod browser_login;
mod network;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            network::network_fetch,
            network::network_get_system_proxy_url,
            browser_login::start_browser_login,
            browser_login::stop_browser_login,
            browser_login::cdp_ws_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
