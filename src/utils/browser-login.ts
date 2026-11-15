import { invoke, path } from '@tauri-apps/api';
import { stringifyCookie } from './cookie';
import { delay } from './index';

export interface CdpCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
}

export async function startBrowserLogin(): Promise<void> {
  const appDataDir = await path.appDataDir();
  const profileDir = await path.join(appDataDir, 'browser_profile');
  await invoke('start_browser_login', { profileDir });
}

export async function stopBrowserLogin(): Promise<void> {
  await invoke('stop_browser_login');
}

export async function getCookiesViaCdp(): Promise<CdpCookie[]> {
  const wsUrl = await invoke<string>('cdp_ws_url');

  return new Promise<CdpCookie[]>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error('读取 Cookie 超时')));
    }, 5000);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Storage.getCookies',
          params: {},
        }),
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data.id !== 1) return;
        const cookies = data.result?.cookies;
        finish(() => resolve(Array.isArray(cookies) ? cookies : []));
      } catch (err) {
        finish(() => reject(err));
      }
    };

    ws.onerror = () => {
      finish(() => reject(new Error('连接浏览器失败')));
    };
  });
}

export async function waitForLoginCookies(
  shouldStop: () => boolean,
): Promise<string | null> {
  const deadline = Date.now() + 5 * 60 * 1000;

  while (Date.now() < deadline) {
    if (shouldStop()) {
      return null;
    }

    try {
      const cookies = await getCookiesViaCdp();
      const relevant = cookies.filter((cookie) => {
        const domain = cookie.domain || '';
        return domain.includes('twitter.com') || domain.includes('x.com');
      });
      const authToken = relevant.find(
        (cookie) => cookie.name === 'auth_token',
      )?.value;
      const ct0 = relevant.find((cookie) => cookie.name === 'ct0')?.value;

      if (authToken && ct0) {
        return stringifyCookie({ auth_token: authToken, ct0 });
      }
    } catch {
      // The browser may not be ready yet; keep polling.
    }

    await delay(2000);
  }

  return null;
}
