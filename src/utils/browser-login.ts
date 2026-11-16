import { invoke, path } from '@tauri-apps/api';
import { stringifyCookie } from './cookie';
import { getDataBaseDir } from './data-dir';
import { delay } from './index';

/**
 * Prepare the single login browser for a login. There is only one
 * browser-login flow: the browser is just a temporary place to log in,
 * and every verified login is kept as a cookie file instead. So every
 * login starts from a clean browser, but the profile itself is never
 * wiped — a cold profile made every browser start slow. When the
 * browser is already running, its cookies are cleared in place; when
 * it is not, it is started with its existing profile and cleared in
 * place as soon as it answers. Returns the auth_token that was in the
 * browser beforehand so the wait loop can ignore it if it shows up
 * again (e.g. the clear raced a still-open tab).
 */
export async function prepareBrowserLogin(): Promise<string | null> {
  let oldToken: string | null = null;
  try {
    const before = await invoke<LoginCookies | null>('poll_login_cookies');
    oldToken = before?.auth_token ?? null;
  } catch {
    // Browser not reachable; nothing to remember.
  }

  try {
    if (await invoke<boolean>('clear_login_browser')) {
      return oldToken;
    }
  } catch {
    // Browser not running; start it below.
  }

  const baseDir = await getDataBaseDir();
  const profileDir = await path.join(baseDir, 'browser_profile');
  await invoke('start_browser_login', { profileDir });
  for (let i = 0; i < 40; i++) {
    try {
      const before = await invoke<LoginCookies | null>('poll_login_cookies');
      if (before?.auth_token) {
        oldToken = before.auth_token;
      }
    } catch {
      // Still starting up.
    }
    try {
      if (await invoke<boolean>('clear_login_browser')) {
        break;
      }
    } catch {
      // Still starting up.
    }
    await delay(500);
  }
  return oldToken;
}

export async function stopBrowserLogin(): Promise<void> {
  await invoke('stop_browser_login');
}

/**
 * After a successful login the verified cookie has been saved to a
 * file, so clear the browser's own session right away: the browser
 * keeps nothing, and the next login starts clean either way.
 */
export async function clearBrowserLoginData(): Promise<void> {
  try {
    await invoke('clear_login_browser_cookies');
  } catch {
    // Browser already gone; the next login clears it before use anyway.
  }
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
  ignoreAuthToken?: string | null,
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
        if (ignoreAuthToken && cookies.auth_token === ignoreAuthToken) {
          // The previous account is still in the browser; keep waiting
          // for the user to actually log the new account in.
          lastError = null;
          onStatus?.('浏览器里还是上一个账号，登好新账号后这里会自动完成');
          await delay(2000);
          continue;
        }
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
