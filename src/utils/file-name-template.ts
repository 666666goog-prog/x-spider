import { REPLACER_MAP } from '../constants/file-name-template';
import { FileNameTemplateData } from '../interfaces/FileNameTemplateData';
import * as R from 'ramda';
import { unicodeFilenamify, unicodeSubstring } from './unicode';

export interface NamingSwitches {
  classifyByAuthor?: boolean;
  classifyByType?: boolean;
  classifyByDate?: boolean;
  classifyByPost?: boolean;
  fileNameWithDate?: boolean;
  fileNameWithAuthor?: boolean;
  fileNameWithContent?: boolean;
  fileNameWithPostId?: boolean;
}

export const CONTENT_SNIPPET_LENGTH = 24;

export function buildWorkFolderName(data: FileNameTemplateData): string {
  const date = data.post.createdAt
    ? data.post.createdAt.format('YYYY-MM-DD')
    : '未知日期';
  const text = (data.post.fullText || '').replace(/\s+/g, ' ').trim();
  const snippet = unicodeSubstring(text, 0, CONTENT_SNIPPET_LENGTH).trim();
  return unicodeFilenamify(snippet ? `${date} ${snippet}` : `${date} ${data.post.id}`);
}

/**
 * Resolved folder parts (below the base save dir) for one media file.
 * A per-work folder is only added when the switch is on AND the post has
 * more than one media file, mirroring how album works get their own folder.
 */
export function buildDirParts(
  switches: NamingSwitches,
  data: FileNameTemplateData,
  isMultiMedia: boolean,
): string[] {
  const parts: string[] = [];
  const pushResolved = (template: string) => {
    const resolved = resolveVariables(template, data).trim();
    if (resolved) parts.push(resolved);
  };
  if (switches.classifyByAuthor ?? true) pushResolved('%USER_SCREEN_NAME%');
  if (switches.classifyByDate ?? false) pushResolved('%POST_TIME,d=1%');
  if (switches.classifyByType ?? true) pushResolved('%MEDIA_TYPE%');
  if ((switches.classifyByPost ?? true) && isMultiMedia) {
    parts.push(buildWorkFolderName(data));
  }
  return parts;
}

export function buildFileName(
  switches: NamingSwitches,
  data: FileNameTemplateData,
): string {
  const parts: string[] = [];
  const pushResolved = (template: string) => {
    const resolved = resolveVariables(template, data).trim();
    if (resolved) parts.push(resolved);
  };
  if (switches.fileNameWithDate ?? true) pushResolved('%POST_TIME%');
  if (switches.fileNameWithAuthor ?? true) pushResolved('%USER_SCREEN_NAME%');
  if (switches.fileNameWithContent ?? true) {
    pushResolved(`%CONTENT,t=${CONTENT_SNIPPET_LENGTH}%`);
  }
  pushResolved(
    (switches.fileNameWithPostId ?? true)
      ? '%POST_ID%-%MEDIA_INDEX%%EXT%'
      : '%MEDIA_INDEX%%EXT%',
  );
  return parts.join(' ');
}

export function resolveVariables(
  templateText: string,
  data: FileNameTemplateData,
): string {
  return R.pipe(
    R.toPairs,
    R.reduce((acc, elem: any) => {
      return acc.replace(
        new RegExp(`%${elem[0]}((?:,[a-z]=.+?)+)?%`, 'gi'),
        (_str, paramsString: string) => {
          const params = R.ifElse(
            R.isNotNil,
            R.pipe(
              // @ts-ignore
              R.slice(1, Infinity),
              R.split(','),
              R.map(R.split('=')),
              R.fromPairs,
            ),
            R.always({}),
            // @ts-ignore
          )(paramsString);
          const s = unicodeFilenamify(String(elem[1].replacer(data, params)));
          return s;
        },
      );
    }, templateText),
  )(REPLACER_MAP);
}
