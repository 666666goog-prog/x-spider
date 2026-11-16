import { fs, path } from '@tauri-apps/api';
import { PersistStorage } from 'zustand/middleware';
import { getDataBaseDir, isPortableMode } from '../../utils/data-dir';

async function writeJsonFile<T = any>(filePath: string, value: T) {
  const dir = await path.dirname(filePath);
  if (!(await fs.exists(dir))) {
    await fs.createDir(dir, {
      recursive: true,
    });
  }
  await fs.writeTextFile(filePath, JSON.stringify(value, undefined, 2));
}

async function getJsonFile(filePath: string): Promise<any | null> {
  if (!(await fs.exists(filePath))) {
    return null;
  }

  const text = await fs.readTextFile(filePath);
  return JSON.parse(text);
}

async function resolveFilePath(name: string): Promise<string> {
  const baseDir = await getDataBaseDir();
  return await path.join(baseDir, `${name}.json`);
}

async function resolveLegacyFilePath(name: string): Promise<string> {
  const appDataDir = await path.appDataDir();
  return await path.join(appDataDir, `${name}.json`);
}

export function createTauriFileStorage<T>(): PersistStorage<T> | undefined {
  return {
    async getItem(name) {
      const filePath = await resolveFilePath(name);
      if (await fs.exists(filePath)) {
        return await getJsonFile(filePath);
      }

      // Portable mode with no data yet: fall back to the installed
      // version's AppData files once, so existing settings/login carry over.
      if (await isPortableMode()) {
        const legacyFilePath = await resolveLegacyFilePath(name);
        if (await fs.exists(legacyFilePath)) {
          return await getJsonFile(legacyFilePath);
        }
      }

      return null;
    },
    async removeItem(name) {
      const filePath = await resolveFilePath(name);
      if (!(await fs.exists(filePath))) {
        return;
      }

      await fs.removeFile(filePath);
    },
    async setItem(name, value) {
      const filePath = await resolveFilePath(name);
      await writeJsonFile(filePath, value);
    },
  };
}
