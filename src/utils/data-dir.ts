import { invoke } from '@tauri-apps/api';

export interface DataDirInfo {
  dataDir: string;
  portable: boolean;
}

let cachedInfo: Promise<DataDirInfo> | null = null;

function resolveDataDirInfo(): Promise<DataDirInfo> {
  if (!cachedInfo) {
    cachedInfo = invoke<DataDirInfo>('get_data_dir_info');
  }
  return cachedInfo;
}

/**
 * Where settings / login state live. The decision is made by the Rust
 * command `get_data_dir_info`: portable builds ship a `portable.txt`
 * next to the exe and then everything is stored in a `data` folder
 * beside the exe; without the marker the normal app data dir is used.
 * (The frontend path API once reported a wrong executable location,
 * which sent portable data to the system dir — do not re-implement
 * this check in TypeScript.)
 */
export function getDataDirInfo(): Promise<DataDirInfo> {
  return resolveDataDirInfo();
}

export async function getDataBaseDir(): Promise<string> {
  return (await resolveDataDirInfo()).dataDir;
}

export async function isPortableMode(): Promise<boolean> {
  return (await resolveDataDirInfo()).portable;
}
