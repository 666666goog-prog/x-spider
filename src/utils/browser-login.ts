import { fs, invoke, path } from '@tauri-apps/api';
import { stringifyCookie } from './cookie';
import { getDataBaseDir } from './data-dir';
import { delay } from './index';

export async function startBrowserLogin(): Promise<void> {
  // If a login browser is already answering on the debug port, reuse it.
  // Starting a second instance would fight over the single debug port,
  // and the polls could end up reading the wrong window.
  try {
    await invoke('cdp_ws_url');
    return;
  } catch {
    // No browser up yet; start one below.
  }
  const baseDir = await getDataBaseDir();
  const profileDir = await path.join(baseDir, 'browser_profile');
  await invoke('start_browser_login', { profileDir });
}

/**
 * Prepare the single login browser for a DIFFERENT account. The previous
 * account's cookie has already been saved to a file, so clearing the
 * browser loses nothing: when the browser is running, its cookies are
 * cleared in place and a fresh login tab is opened; when it is not, its
 * profile folder is wiped before it starts. Returns the previous
 * account's auth_token so the wait loop can ignore it if it shows up
 * again (e.g. the clear raced a still-open tab).
 */
export async function prepareOtherAccountLogin(): Promise<string | null> {
  let oldToken: string | null = null;
  try {
    const before = await invoke<LoginCookies | null>('poll_login_cookies');
    oldToken = before?.auth_token ?? null;
  } catch {
    // Browser not reachable; nothing to remember.
  }

  let clearedInPlace = false;
  try {
    clearedInPlace = await invoke<boolean>('clear_login_browser');
  } catch {
    clearedInPlace = false;
  }

  if (!clearedInPlace) {
    const baseDir = await getDataBaseDir();
    const profileDir = await path.join(baseDir, 'browser_profile');
    if (await fs.exists(profileDir)) {
      await fs.removeDir(profileDir, { recursive: true }).catch(() => {});
    }
    await invoke('start_browser_login', { profileDir });
  }
  return oldToken;
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
