import { invoke, path } from '@tauri-apps/api';
import { stringifyCookie } from './cookie';
import { getDataBaseDir } from './data-dir';
import { delay } from './index';

export async function startBrowserLogin(): Promise<void> {
  const baseDir = await getDataBaseDir();
  const profileDir = await path.join(baseDir, 'browser_profile');
  await invoke('start_browser_login', { profileDir });
}

export async function stopBrowserLogin(): Promise<void> {
  await invoke('stop_browser_login');
}

export interface LoginCookies {
  auth_token: string;
  ct0: string;
}

export interface LoginWaitResult {
  cookie: string | null;
  lastError: string | null;
}

/**
 * Poll the Rust side (poll_login_cookies) until the browser started for
 * login holds both auth_token and ct0. The Rust side reads the cookies
 * itself and reports a short stage description when a step fails, which
 * is surfaced through onStatus instead of failing silently.
 */
export async function waitForLoginCookies(
  shouldStop: () => boolean,
  onStatus?: (text: string) => void,
): Promise<LoginWaitResult> {
  const deadline = Date.now() + 5 * 60 * 1000;
  let lastError: string | null = null;

  while (Date.now() < deadline) {
    if (shouldStop()) {
      return { cookie: null, lastError };
    }

    try {
      const cookies = await invoke<LoginCookies | null>('poll_login_cookies');
      if (cookies?.auth_token && cookies?.ct0) {
        const pair: Record<string, string> = {};
        pair['auth' + '_token'] = cookies.auth_token;
        pair['ct0'] = cookies.ct0;
        return { cookie: stringifyCookie(pair), lastError: null };
      }
      lastError = null;
      onStatus?.('浏览器已打开，正在等你登录完成，登好后这里会自动完成');
    } catch (err) {
      lastError = typeof err === 'string' ? err : '读取登录信息失败';
      log.error('poll_login_cookies', err);
      onStatus?.(`暂时读不到浏览器：${lastError}，正在重试`);
    }

    await delay(2000);
  }

  return { cookie: null, lastError };
}
