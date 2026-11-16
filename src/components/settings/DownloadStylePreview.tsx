/* eslint-disable react/prop-types */
import React from 'react';
import { EXAMPLE_FILE_NAME_TEMPLATE_DATA } from '../../constants/file-name-template';
import { useSettingsStore } from '../../stores/settings';
import { buildDirParts, buildFileName } from '../../utils/file-name-template';

/**
 * Live preview of the current download style (folder layout + file name),
 * computed from the same switch settings the downloader uses, with the
 * example post treated as a multi-media post so a per-work folder shows.
 */
export const DownloadStylePreview: React.FC = () => {
  const download = useSettingsStore((s) => s.download);

  const dirParts = buildDirParts(
    download,
    EXAMPLE_FILE_NAME_TEMPLATE_DATA,
    true,
  );
  const fileName = buildFileName(download, EXAMPLE_FILE_NAME_TEMPLATE_DATA);
  const base = download.saveDirBase || '保存路径';
  const folderExample = [base, ...dirParts].join('\\');

  return (
    <section
      aria-label="当前样式"
      className="text-xs bg-gray-100 rounded-sm p-3 text-gray-800 mb-4"
    >
      <p className="font-bold mb-1">当前样式</p>
      <p className="break-all">文件夹：{folderExample}</p>
      <p className="break-all">文件名：{fileName}</p>
      <p className="mt-1 text-gray-500">
        开关一变这里就跟着变，下载时就是这个样子（示例里的作者和内容是假的）。
      </p>
    </section>
  );
};
