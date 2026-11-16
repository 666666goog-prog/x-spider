import { fs, path } from '@tauri-apps/api';

let cachedBaseDir: Promise<string> | null = null;
let portableMode = false;

async function resolveDataBaseDir(): Promise<string> {
  try {
    const exeDir = await path.executableDir();
    const markerPath = await path.join(exeDir, 'portable.txt');
    if (await fs.exists(markerPath)) {
      portableMode = true;
      return await path.join(exeDir, 'data');
    }
  } catch (err) {
    // Fall back to the normal app data dir below.
  }
  portableMode = false;
  return await path.appDataDir();
}

/**
 * Where settings / login state live.
 * Portable builds ship a `portable.txt` next to the exe: then everything is
 * stored in a `data` folder beside the exe, so the whole folder can be
 * copied around. Without the marker the historical AppData location is used.
 */
export function getDataBaseDir(): Promise<string> {
  if (!cachedBaseDir) {
    cachedBaseDir = resolveDataBaseDir();
  }
  return cachedBaseDir;
}

export async function isPortableMode(): Promise<boolean> {
  await getDataBaseDir();
  return portableMode;
}
