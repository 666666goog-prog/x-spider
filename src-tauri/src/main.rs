// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod browser_login;
mod data_dir;
mod network;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            network::network_fetch,
            network::network_get_system_proxy_url,
            data_dir::get_data_dir_info,
            browser_login::start_browser_login,
            browser_login::stop_browser_login,
            browser_login::cdp_ws_url,
            browser_login::poll_login_cookies,
            browser_login::clear_login_browser,
            browser_login::clear_login_browser_cookies,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
