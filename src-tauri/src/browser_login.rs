use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;

static BROWSER_CHILD: Mutex<Option<Child>> = Mutex::new(None);

const DEBUG_PORT: u16 = 9229;
const LOGIN_URL: &str = "https://x.com/i/flow/login";

fn browser_candidates() -> Vec<PathBuf> {
    vec![
        // Edge (preferred)
        PathBuf::from(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
        PathBuf::from(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
        // Chrome
        PathBuf::from(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        PathBuf::from(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
    ]
}

fn find_browser() -> Option<PathBuf> {
    browser_candidates().into_iter().find(|path| path.exists())
}

fn kill_stored_child() {
    if let Ok(mut guard) = BROWSER_CHILD.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[tauri::command]
pub fn start_browser_login(profile_dir: String) -> Result<(), String> {
    kill_stored_child();

    std::fs::create_dir_all(&profile_dir)
        .map_err(|err| format!("创建浏览器资料目录失败：{}", err))?;

    let browser = find_browser().ok_or_else(|| {
        "没有找到 Edge 或 Chrome 浏览器，请先安装其中一个浏览器再试。".to_string()
    })?;

    let child = Command::new(&browser)
        .arg(format!("--remote-debugging-port={}", DEBUG_PORT))
        .arg(format!("--user-data-dir={}", profile_dir))
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg(LOGIN_URL)
        .spawn()
        .map_err(|err| format!("打开浏览器失败：{}", err))?;

    let mut guard = BROWSER_CHILD
        .lock()
        .map_err(|err| format!("保存浏览器进程失败：{}", err))?;
    *guard = Some(child);
    Ok(())
}

#[tauri::command]
pub fn stop_browser_login() -> Result<(), String> {
    kill_stored_child();
    Ok(())
}

#[tauri::command]
pub async fn cdp_ws_url() -> Result<String, String> {
    let url = format!("http://127.0.0.1:{}/json/version", DEBUG_PORT);
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|err| format!("连接浏览器调试端口失败：{}", err))?;
    let value: serde_json::Value = response
        .json()
        .await
        .map_err(|err| format!("解析浏览器调试信息失败：{}", err))?;
    value
        .get("webSocketDebuggerUrl")
        .and_then(|item| item.as_str())
        .map(|item| item.to_string())
        .ok_or_else(|| "浏览器调试信息里没有 WebSocket 地址".to_string())
}
