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

#[derive(serde::Serialize)]
pub struct LoginCookies {
    pub auth_token: String,
    pub ct0: String,
}

async fn cdp_http_json(url: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|_| "连不上浏览器调试端口".to_string())?;
    response
        .json()
        .await
        .map_err(|_| "浏览器调试信息解析失败".to_string())
}

/// Send one CDP method over a direct WebSocket connection (from Rust, not
/// from the webview) and return its `result`. `pre_method` is sent first
/// and its response ignored (e.g. Network.enable before Network calls).
fn cdp_ws_call(
    ws_url: &str,
    method: &str,
    pre_method: Option<&str>,
) -> Result<serde_json::Value, String> {
    use std::net::{SocketAddr, TcpStream};
    use std::time::Duration;
    use tungstenite::Message;

    let authority = ws_url
        .strip_prefix("ws://")
        .and_then(|rest| rest.split('/').next())
        .ok_or_else(|| "浏览器调试地址不对".to_string())?;
    let addr: SocketAddr = authority
        .parse()
        .map_err(|_| "浏览器调试地址不对".to_string())?;
    let stream = TcpStream::connect_timeout(&addr, Duration::from_millis(1500))
        .map_err(|_| "连不上浏览器调试端口".to_string())?;
    let _ = stream.set_read_timeout(Some(Duration::from_millis(3000)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(3000)));
    let (mut socket, _) =
        tungstenite::client(ws_url, stream).map_err(|_| "浏览器拒绝了调试连接".to_string())?;

    if let Some(pre) = pre_method {
        let pre_request = serde_json::json!({ "id": 2, "method": pre, "params": {} });
        let _ = socket.write_message(Message::Text(pre_request.to_string()));
    }
    let request = serde_json::json!({ "id": 1, "method": method, "params": {} });
    socket
        .write_message(Message::Text(request.to_string()))
        .map_err(|_| "向浏览器发送读取请求失败".to_string())?;

    loop {
        let message = socket
            .read_message()
            .map_err(|_| "读取浏览器回复失败".to_string())?;
        if let Message::Text(text) = message {
            let value: serde_json::Value = match serde_json::from_str(&text) {
                Ok(v) => v,
                Err(_) => continue,
            };
            if value.get("id").and_then(|item| item.as_i64()) != Some(1) {
                continue;
            }
            if let Some(err) = value.get("error") {
                return Err(format!("浏览器返回错误：{}", err));
            }
            return Ok(value
                .get("result")
                .cloned()
                .unwrap_or(serde_json::Value::Null));
        }
    }
}

fn extract_login_cookies(result: &serde_json::Value) -> Option<LoginCookies> {
    let cookies = result.get("cookies")?.as_array()?;
    let mut auth_token: Option<String> = None;
    let mut ct0: Option<String> = None;
    for cookie in cookies {
        let domain = cookie
            .get("domain")
            .and_then(|item| item.as_str())
            .unwrap_or("");
        if !domain.contains("twitter.com") && !domain.contains("x.com") {
            continue;
        }
        let name = cookie
            .get("name")
            .and_then(|item| item.as_str())
            .unwrap_or("");
        let value = cookie
            .get("value")
            .and_then(|item| item.as_str())
            .unwrap_or("");
        if value.is_empty() {
            continue;
        }
        match name {
            "auth_token" => auth_token = Some(value.to_string()),
            "ct0" => ct0 = Some(value.to_string()),
            _ => {}
        }
    }
    match (auth_token, ct0) {
        (Some(auth), Some(csrf)) => Some(LoginCookies {
            auth_token: auth,
            ct0: csrf,
        }),
        _ => None,
    }
}

fn has_any_cookies(result: &serde_json::Value) -> bool {
    result
        .get("cookies")
        .and_then(|item| item.as_array())
        .map(|list| !list.is_empty())
        .unwrap_or(false)
}

/// One poll attempt: read the login cookies from the browser started by
/// start_browser_login. Ok(None) means the browser answered but the user
/// has not finished logging in yet; Err carries a short stage description
/// so the UI can show where it got stuck instead of failing silently.
#[tauri::command]
pub async fn poll_login_cookies() -> Result<Option<LoginCookies>, String> {
    let version_url = format!("http://127.0.0.1:{}/json/version", DEBUG_PORT);
    let version = cdp_http_json(version_url).await?;
    let browser_ws = version
        .get("webSocketDebuggerUrl")
        .and_then(|item| item.as_str())
        .ok_or_else(|| "浏览器调试信息里没有 WebSocket 地址".to_string())?
        .to_string();

    let mut browser_level_error: Option<String> = None;
    match cdp_ws_call(&browser_ws, "Storage.getCookies", None) {
        Ok(result) => {
            if let Some(cookies) = extract_login_cookies(&result) {
                return Ok(Some(cookies));
            }
            if has_any_cookies(&result) {
                return Ok(None);
            }
            // Browser-level read returned nothing at all; try page level.
        }
        Err(err) => {
            browser_level_error = Some(err);
        }
    }

    let list_url = format!("http://127.0.0.1:{}/json/list", DEBUG_PORT);
    let targets = cdp_http_json(list_url).await?;
    let empty: Vec<serde_json::Value> = Vec::new();
    let target_list = targets.as_array().unwrap_or(&empty);
    let page_ws = target_list
        .iter()
        .filter(|target| target.get("type").and_then(|item| item.as_str()) == Some("page"))
        .max_by_key(|target| {
            let url = target
                .get("url")
                .and_then(|item| item.as_str())
                .unwrap_or("");
            if url.contains("x.com") || url.contains("twitter.com") {
                1
            } else {
                0
            }
        })
        .and_then(|target| target.get("webSocketDebuggerUrl"))
        .and_then(|item| item.as_str())
        .map(|item| item.to_string());

    if let Some(page_ws) = page_ws {
        match cdp_ws_call(&page_ws, "Network.getAllCookies", Some("Network.enable")) {
            Ok(result) => {
                if let Some(cookies) = extract_login_cookies(&result) {
                    return Ok(Some(cookies));
                }
                return Ok(None);
            }
            Err(err) => {
                return Err(browser_level_error.unwrap_or(err));
            }
        }
    }

    match browser_level_error {
        Some(err) => Err(err),
        None => Ok(None),
    }
}
