use std::collections::HashMap;
use reqwest::Method;
use serde_json::Value;

#[derive(Default, serde::Serialize)]
pub struct Response {
  status: u16,
  headers: HashMap<String, Vec<String>>,
  body: Value,
}

#[tauri::command]
pub async fn network_fetch(
  method: String,
  url: String,
  body: String,
  enable_proxy: bool,
  proxy_url: String,
  response_type: String,
  headers: HashMap<String, String>,
) -> Result<Response, String> {
  let map_reqwest_err = |err: reqwest::Error| err.to_string();
  // Convert method string into Method
  let method: Method = match method.to_uppercase().as_str() {
    "GET" => Ok(Method::GET),
    "POST" => Ok(Method::POST),
    "PATCH" => Ok(Method::PATCH),
    "PUT" => Ok(Method::PUT),
    "DELETE" => Ok(Method::DELETE),
    "HEAD" => Ok(Method::HEAD),
    _ => Err("Invalid method".to_string()),
  }?;

  // Build client
  let client = {
    let mut b = reqwest::Client::builder();

    // Auto set proxy settings
    if enable_proxy {
      if proxy_url.len() == 0 {
        // Use system proxy, do nothing
      } else {
        // Use custom proxy url
        let proxy_http = reqwest::Proxy::http(proxy_url.clone()).or(Err("Failed to set proxy url".to_string()))?;
        let proxy_https = reqwest::Proxy::https(proxy_url.clone()).or(Err("Failed to set proxy url".to_string()))?;
        b = b.proxy(proxy_http).proxy(proxy_https);
      }
    } else {
      // No proxy
      b = b.no_proxy();
    }

    b.build().or(Err("Failed to build reqwest client".to_string()))
  }?;

  // Build request
  let request = {
    let mut req = client.request(method.clone(), url);
    for (k, v) in headers {
      req = req.header(k, v);
    }

    if !matches!(method.clone(), Method::GET) {
      req = req.body(body);
    }

    req
  };

  // Send request
  let response = request.send().await.map_err(map_reqwest_err)?;

  // Extract some info
  let status = response.status().as_u16();
  let resp_headers = {
    let reqwest_headers = response.headers();
    let mut h: HashMap<String, Vec<String>> = HashMap::with_capacity(reqwest_headers.len());

    for (k, v) in reqwest_headers {
      let v = v.to_str();
      if let Err(_) = v {
        continue;
      }

      let v = v.unwrap().to_string();
      h.entry(k.to_string()).and_modify(|arr: &mut Vec<String>| arr.push(v.clone()))
        .or_insert_with(|| vec![v]);
    }

    h
  };

  // Load response body
  let body: Value = {
    match response_type.as_str() {
      "json" => response.json().await.map_err(map_reqwest_err).map(|res| Value::Object(res)),
      "text" => response.text().await.map_err(map_reqwest_err).map(|res| Value::String(res)),
      "binary" => {
        let bytes = response.bytes().await.map_err(map_reqwest_err)?;
        serde_json::to_value(bytes.to_vec()).map_err(|err| err.to_string())
      },
      _ => Err("Unsupported response type".to_string())
    }
  }?;

  return Ok(Response {
    status,
    body,
    headers: resp_headers })
}

fn proxy_authority(raw: &str) -> Option<String> {
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    return None;
  }
  let without_scheme = trimmed.rsplit("://").next().unwrap_or(trimmed);
  let authority = without_scheme.split('/').next().unwrap_or("");
  let host_port = authority.rsplit('@').next().unwrap_or(authority);
  if host_port.is_empty() {
    None
  } else {
    Some(host_port.to_string())
  }
}

#[cfg(windows)]
fn read_windows_system_proxy(mapped_proxies: &mut HashMap<String, String>) {
  use winreg::enums::HKEY_CURRENT_USER;
  use winreg::RegKey;

  let hkcu = RegKey::predef(HKEY_CURRENT_USER);
  let key = match hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings") {
    Ok(key) => key,
    Err(_) => return,
  };
  let enabled: u32 = key.get_value("ProxyEnable").unwrap_or(0);
  if enabled == 0 {
    return;
  }
  let server: String = match key.get_value("ProxyServer") {
    Ok(server) => server,
    Err(_) => return,
  };
  if server.contains('=') {
    for part in server.split(';') {
      if let Some((scheme, addr)) = part.split_once('=') {
        if let Some(authority) = proxy_authority(addr) {
          mapped_proxies.insert(scheme.trim().to_lowercase(), authority);
        }
      }
    }
  } else if let Some(authority) = proxy_authority(&server) {
    mapped_proxies.insert("http".to_string(), authority.clone());
    mapped_proxies.insert("https".to_string(), authority);
  }
}

#[tauri::command]
pub async fn network_get_system_proxy_url() -> Result<HashMap<String, String>, ()> {
  let mut mapped_proxies: HashMap<String, String> = HashMap::new();

  for (scheme, var_names) in [
    ("http", ["HTTP_PROXY", "http_proxy"]),
    ("https", ["HTTPS_PROXY", "https_proxy"]),
    ("all", ["ALL_PROXY", "all_proxy"]),
  ] {
    for var_name in var_names {
      if let Ok(value) = std::env::var(var_name) {
        if let Some(authority) = proxy_authority(&value) {
          mapped_proxies.insert(scheme.to_string(), authority);
          break;
        }
      }
    }
  }

  #[cfg(windows)]
  read_windows_system_proxy(&mut mapped_proxies);

  Ok(mapped_proxies)
}
