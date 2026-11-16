import { fs, path } from '@tauri-apps/api';
import { getDataBaseDir } from './data-dir';

/**
 * Saved login cookies, one plain text file per account, stored in an
 * `accounts` folder inside the app's data dir (the portable folder for
 * the portable build). Lets the user keep several accounts and switch
 * between them without logging in again.
 */

async function accountsDir(): Promise<string> {
  const baseDir = await getDataBaseDir();
  return path.join(baseDir, 'accounts');
}

function fileNameFor(screenName: string): string {
  return `${screenName.replace(/[\\/:*?"<>|]/g, '_')}.txt`;
}

export async function saveAccountCookie(
  screenName: string,
  cookie: string,
): Promise<void> {
  const dir = await accountsDir();
  if (!(await fs.exists(dir))) {
    await fs.createDir(dir, { recursive: true });
  }
  await fs.writeTextFile(await path.join(dir, fileNameFor(screenName)), cookie);
}

export async function listSavedAccounts(): Promise<string[]> {
  const dir = await accountsDir();
  if (!(await fs.exists(dir))) {
    return [];
  }
  const entries = await fs.readDir(dir);
  return entries
    .map((entry) => entry.name || '')
    .filter((name) => name.toLowerCase().endsWith('.txt'))
    .map((name) => name.slice(0, -4))
    .sort();
}

export async function loadAccountCookie(
  screenName: string,
): Promise<string | null> {
  const dir = await accountsDir();
  const filePath = await path.join(dir, fileNameFor(screenName));
  if (!(await fs.exists(filePath))) {
    return null;
  }
  const text = (await fs.readTextFile(filePath)).trim();
  return text || null;
}

export async function deleteAccountCookie(screenName: string): Promise<void> {
  const dir = await accountsDir();
  const filePath = await path.join(dir, fileNameFor(screenName));
  if (await fs.exists(filePath)) {
    await fs.removeFile(filePath);
  }
}
