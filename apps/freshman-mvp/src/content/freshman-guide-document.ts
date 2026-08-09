import { createHash } from 'node:crypto';
import type { SourceRef } from '../domain/models.js';
import {
  sourceForGuideHeading,
  type FreshmanGuideSectionId,
} from './freshman-guide.js';

export type { FreshmanGuideSectionId } from './freshman-guide.js';

export interface FreshmanGuideChunk {
  id: string;
  titlePath: readonly string[];
  displayTitle: string;
  content: string;
  sectionId: FreshmanGuideSectionId;
  sequence: number;
  source: SourceRef;
}

const MAX_CHUNK_CODE_POINTS = 1_200;
const CAMPUS_TERMS = ['图书馆', '教学楼', '体育场', '月雅湖'];
const MAJOR_SECTIONS: Readonly<Record<string, FreshmanGuideSectionId>> = {
  开学准备篇: 'preparation',
  宿舍篇: 'dormitory',
  生活篇: 'life',
  助学政策篇: 'aid',
};

function cleanHeading(rawHeading: string): string {
  return rawHeading.trim().replace(/[：:]+$/, '').trim();
}

function displayHeading(heading: string): string {
  return heading.replace(/^\d+(?:\.\d+)*\.?\s*/, '').trim() || heading;
}

function normalizeParagraphs(lines: readonly string[]): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const paragraph = current.join('\n').trim();
    current = [];
    if (paragraph && !paragraph.includes('原文图片未转录')) {
      paragraphs.push(paragraph);
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || /^[-*_]{3,}$/.test(line)) {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();
  return paragraphs;
}

function splitByCodePoints(text: string): string[] {
  const codePoints = Array.from(text);
  const pieces: string[] = [];
  for (let start = 0; start < codePoints.length; start += MAX_CHUNK_CODE_POINTS) {
    pieces.push(codePoints.slice(start, start + MAX_CHUNK_CODE_POINTS).join(''));
  }
  return pieces;
}

function splitContent(paragraphs: readonly string[]): string[] {
  const chunks: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (current) {
      chunks.push(current);
      current = '';
    }
  };

  for (const paragraph of paragraphs) {
    if (Array.from(paragraph).length > MAX_CHUNK_CODE_POINTS) {
      pushCurrent();
      chunks.push(...splitByCodePoints(paragraph));
      continue;
    }

    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (Array.from(next).length > MAX_CHUNK_CODE_POINTS) {
      pushCurrent();
      current = paragraph;
    } else {
      current = next;
    }
  }
  pushCurrent();
  return chunks;
}

function sectionFor(titlePath: readonly string[]): FreshmanGuideSectionId | null {
  const majorSection = titlePath[0];
  const sectionId = MAJOR_SECTIONS[majorSection];
  if (!sectionId) {
    return null;
  }
  if (sectionId === 'life' && titlePath.some((heading) => CAMPUS_TERMS.some((term) => heading.includes(term)))) {
    return 'campus';
  }
  return sectionId;
}

function slugFor(titlePath: readonly string[]): string {
  return titlePath
    .join('-')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

function stableId(sectionId: FreshmanGuideSectionId, titlePath: readonly string[], partNumber: number): string {
  const digest = createHash('sha256')
    .update(`${sectionId}\0${titlePath.join('\0')}\0${partNumber}`, 'utf8')
    .digest('hex')
    .slice(0, 16);
  return `freshman-guide-${sectionId}-${slugFor(titlePath)}-part-${partNumber}-${digest}`;
}

export function parseFreshmanGuideMarkdown(markdown: string): FreshmanGuideChunk[] {
  const chunks: FreshmanGuideChunk[] = [];
  const headings = new Map<number, string>();
  let body: string[] = [];
  let activeLevel: number | null = null;

  const flush = () => {
    if (activeLevel === null) {
      body = [];
      return;
    }
    const titlePath = [2, 3, 4, 5]
      .map((level) => headings.get(level))
      .filter((heading): heading is string => Boolean(heading));
    const sectionId = sectionFor(titlePath);
    const paragraphs = normalizeParagraphs(body);
    body = [];
    if (!sectionId || !titlePath.length || !paragraphs.length) {
      return;
    }

    const displayTitle = displayHeading(titlePath.at(-1) as string);
    for (const [index, content] of splitContent(paragraphs).entries()) {
      const partNumber = index + 1;
      chunks.push({
        id: stableId(sectionId, titlePath, partNumber),
        titlePath,
        displayTitle,
        content,
        sectionId,
        sequence: chunks.length,
        source: sourceForGuideHeading(sectionId, displayTitle),
      });
    }
  };

  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const headingMatch = /^(#{2,5})\s+(.+?)\s*$/.exec(line);
    if (!headingMatch) {
      if (activeLevel !== null) {
        body.push(line);
      }
      continue;
    }

    flush();
    const level = headingMatch[1].length;
    const heading = cleanHeading(headingMatch[2]);
    for (const existingLevel of [...headings.keys()]) {
      if (existingLevel >= level) {
        headings.delete(existingLevel);
      }
    }
    headings.set(level, heading);
    activeLevel = level === 2 ? null : level;
  }
  flush();
  return chunks;
}
