export interface Settings_V1 {
  proxy: {
    enable: boolean;
    url: string;
    useSystem: boolean;
  };
  download: {
    savePath: string;
    fileNameTemplate: string;
    sameFileSkip: boolean;
  };
  app: {
    autoCheckUpdate: boolean;
    acceptPrerelease: boolean;
  };
}

export interface Settings_V2 {
  proxy: {
    enable: boolean;
    url: string;
    useSystem: boolean;
  };
  download: {
    saveDirBase: string;
    dirTemplate: string;
    fileNameTemplate: string;
    sameFileSkip: boolean;
  };
  app: {
    autoCheckUpdate: boolean;
    acceptPrerelease: boolean;
    writeLogs: boolean;
  };
}

export interface Settings_V3 {
  proxy: {
    enable: boolean;
    url: string;
    useSystem: boolean;
  };
  download: {
    saveDirBase: string;
    // Kept only for backward compatibility with old config files.
    // The UI and download logic no longer use these templates.
    dirTemplate: string;
    fileNameTemplate: string;
    sameFileSkip: boolean;
    classifyByAuthor: boolean;
    classifyByType: boolean;
    classifyByDate: boolean;
    fileNameWithDate: boolean;
    fileNameWithAuthor: boolean;
    fileNameWithPostId: boolean;
  };
  app: {
    autoCheckUpdate: boolean;
    acceptPrerelease: boolean;
    writeLogs: boolean;
  };
}

export type Settings = Settings_V3;
