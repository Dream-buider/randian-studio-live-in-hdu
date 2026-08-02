import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

const APPROVED_CHANNEL = 'live-in-hdu-approved';
const SUPPORTED_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.xlsx',
  '.pptx',
  '.txt',
  '.md',
  '.markdown',
]);
const TERMINAL_PARSE_STATES = new Set<KnowledgeParseStatus>([
  'completed',
  'failed',
  'cancelled',
]);

export type KnowledgeParseStatus =
  | 'validated'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ApprovedKnowledgeItem {
  itemPath: string;
  absolutePath: string;
  title: string;
  sourceType: 'official' | 'community' | 'student';
  sourceUrl: string;
  publishedAt: string;
  applicableYear: number;
  approvedBy: string;
  approvedAt: string;
  ingestMode: 'file' | 'manual';
  contentSha256: string;
}

export interface ApprovedKnowledgeManifest {
  version: 1;
  manifestPath: string;
  items: ApprovedKnowledgeItem[];
}

export interface KnowledgeImportRecord {
  id: string;
  manifestPath: string;
  itemPath: string;
  version: number;
  contentSha256: string;
  title: string;
  sourceType: ApprovedKnowledgeItem['sourceType'];
  sourceUrl: string;
  publishedAt: string;
  applicableYear: number;
  approvedBy: string;
  approvedAt: string;
  ingestMode: ApprovedKnowledgeItem['ingestMode'];
  knowledgeBaseId: string;
  weknoraKnowledgeId: string | null;
  parseStatus: KnowledgeParseStatus;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeImportStore {
  list(): Promise<KnowledgeImportRecord[]>;
  findByHash(
    knowledgeBaseId: string,
    contentSha256: string,
  ): Promise<KnowledgeImportRecord | null>;
  findApproval(
    manifestPath: string,
    itemPath: string,
    approvedBy: string,
    approvedAt: string,
  ): Promise<KnowledgeImportRecord | null>;
  createVersion(
    input: Omit<
      KnowledgeImportRecord,
      'id' | 'version' | 'weknoraKnowledgeId' | 'parseStatus'
      | 'lastError' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<KnowledgeImportRecord>;
  updateState(
    id: string,
    input: {
      weknoraKnowledgeId?: string;
      parseStatus: KnowledgeParseStatus;
      lastError: string | null;
    },
  ): Promise<void>;
  appendEvent(
    importId: string,
    status: KnowledgeParseStatus,
    detail: string | null,
  ): Promise<void>;
}

export interface KnowledgeUploadClient {
  upload(
    item: ApprovedKnowledgeItem,
    knowledgeBaseId: string,
  ): Promise<{ knowledgeId: string; parseStatus: KnowledgeParseStatus }>;
  getParseState(
    knowledgeBaseId: string,
    knowledgeId: string,
  ): Promise<{ parseStatus: KnowledgeParseStatus; error: string | null }>;
}

interface ManifestItemInput {
  path?: unknown;
  title?: unknown;
  sourceType?: unknown;
  sourceUrl?: unknown;
  publishedAt?: unknown;
  applicableYear?: unknown;
  approvedBy?: unknown;
  approvedAt?: unknown;
  ingestMode?: unknown;
}

function requiredString(field: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-blank string`);
  }
  return value.trim();
}

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf())
    && date.toISOString().slice(0, 10) === value;
}

function validApprovalTimestamp(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|([+-])(\d{2}):(\d{2}))$/u
    .exec(value);
  if (!match || !validCalendarDate(match[1])) {
    return false;
  }
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  const offsetHour = match[6] === undefined ? 0 : Number(match[6]);
  const offsetMinute = match[7] === undefined ? 0 : Number(match[7]);
  return hour <= 23
    && minute <= 59
    && second <= 59
    && offsetHour <= 23
    && offsetMinute <= 59
    && Number.isFinite(Date.parse(value));
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.length === 0
    || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function safeRelativePath(value: unknown): string {
  const raw = requiredString('path', value);
  if (
    path.isAbsolute(raw)
    || path.win32.isAbsolute(raw)
    || path.posix.isAbsolute(raw)
    || raw.split(/[\\/]+/u).includes('..')
  ) {
    throw new Error('path must be a safe relative path');
  }
  const segments = raw.split(/[\\/]+/u).filter((segment) => segment && segment !== '.');
  if (segments.length === 0) {
    throw new Error('path must be a safe relative path');
  }
  return segments.join('/');
}

function safeSourceUrl(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  if (typeof value !== 'string') {
    throw new Error('sourceUrl must be a string');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return '';
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
    return parsed.href;
  } catch {
    throw new Error('sourceUrl must be an HTTP(S) URL or blank');
  }
}

async function sha256(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

export async function validateApprovedKnowledgeManifest(
  manifestPath: string,
  approvedRoot: string,
): Promise<ApprovedKnowledgeManifest> {
  const explicitManifestPath = requiredString('manifestPath', manifestPath);
  const explicitApprovedRoot = requiredString('approvedRoot', approvedRoot);
  const canonicalManifestPath = await realpath(explicitManifestPath).catch(() => {
    throw new Error('manifest file does not exist');
  });
  const canonicalApprovedRoot = await realpath(explicitApprovedRoot).catch(() => {
    throw new Error('approved knowledge root does not exist');
  });
  const rootStats = await stat(canonicalApprovedRoot);
  if (!rootStats.isDirectory()) {
    throw new Error('approved knowledge root must be a directory');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(canonicalManifestPath, 'utf8')) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('manifest must contain valid JSON');
    }
    throw error;
  }
  if (
    typeof parsed !== 'object'
    || parsed === null
    || Array.isArray(parsed)
    || !('version' in parsed)
    || parsed.version !== 1
    || !('items' in parsed)
    || !Array.isArray(parsed.items)
  ) {
    throw new Error('manifest must have version 1 and an items array');
  }

  const seenPaths = new Set<string>();
  const items: ApprovedKnowledgeItem[] = [];
  for (const [index, rawValue] of parsed.items.entries()) {
    if (typeof rawValue !== 'object' || rawValue === null || Array.isArray(rawValue)) {
      throw new Error(`items[${index}] must be an object`);
    }
    const raw = rawValue as ManifestItemInput;
    const itemPath = safeRelativePath(raw.path);
    const duplicateKey = itemPath.toLocaleLowerCase('en-US');
    if (seenPaths.has(duplicateKey)) {
      throw new Error(`duplicate path in manifest: ${itemPath}`);
    }
    seenPaths.add(duplicateKey);

    const extension = path.extname(itemPath).toLocaleLowerCase('en-US');
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      throw new Error(`unsupported extension for ${itemPath}`);
    }
    const lexicalPath = path.resolve(canonicalApprovedRoot, ...itemPath.split('/'));
    if (!isWithin(canonicalApprovedRoot, lexicalPath)) {
      throw new Error(`path must be a safe relative path: ${itemPath}`);
    }
    const absolutePath = await realpath(lexicalPath).catch(() => {
      throw new Error(`approved knowledge file does not exist: ${itemPath}`);
    });
    if (!isWithin(canonicalApprovedRoot, absolutePath)) {
      throw new Error(`approved knowledge file resolves outside approved root: ${itemPath}`);
    }
    const fileStats = await stat(absolutePath);
    if (!fileStats.isFile()) {
      throw new Error(`approved knowledge path is not a file: ${itemPath}`);
    }

    const title = requiredString(`items[${index}].title`, raw.title);
    if (!['official', 'community', 'student'].includes(String(raw.sourceType))) {
      throw new Error(`items[${index}].sourceType is invalid`);
    }
    const sourceType = raw.sourceType as ApprovedKnowledgeItem['sourceType'];
    const sourceUrl = safeSourceUrl(raw.sourceUrl);
    const publishedAt = requiredString(`items[${index}].publishedAt`, raw.publishedAt);
    if (!validCalendarDate(publishedAt)) {
      throw new Error(`items[${index}].publishedAt is not a valid calendar date`);
    }
    if (
      typeof raw.applicableYear !== 'number'
      || !Number.isInteger(raw.applicableYear)
      || raw.applicableYear < 2000
      || raw.applicableYear > 2100
    ) {
      throw new Error(`items[${index}].applicableYear is invalid`);
    }
    const approvedBy = requiredString(`items[${index}].approvedBy`, raw.approvedBy);
    const approvedAt = requiredString(`items[${index}].approvedAt`, raw.approvedAt);
    if (!validApprovalTimestamp(approvedAt)) {
      throw new Error(`items[${index}].approvedAt must be an RFC3339 timestamp`);
    }
    const ingestMode = raw.ingestMode === undefined ? 'file' : raw.ingestMode;
    if (ingestMode !== 'file' && ingestMode !== 'manual') {
      throw new Error(`items[${index}].ingestMode must be file or manual`);
    }
    if (ingestMode === 'manual' && extension !== '.md' && extension !== '.markdown') {
      throw new Error(`manual ingestion is allowed only for Markdown: ${itemPath}`);
    }

    items.push({
      itemPath,
      absolutePath,
      title,
      sourceType,
      sourceUrl,
      publishedAt,
      applicableYear: raw.applicableYear,
      approvedBy,
      approvedAt,
      ingestMode,
      contentSha256: await sha256(absolutePath),
    });
  }

  return {
    version: 1,
    manifestPath: canonicalManifestPath,
    items,
  };
}

interface WeKnoraKnowledgeClientOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

interface RawKnowledge {
  id?: unknown;
  parse_status?: unknown;
  error_message?: unknown;
}

function normalizeParseStatus(value: unknown): KnowledgeParseStatus {
  if (
    value === 'pending'
    || value === 'processing'
    || value === 'completed'
    || value === 'failed'
    || value === 'cancelled'
  ) {
    return value;
  }
  return 'processing';
}

export class WeKnoraKnowledgeClient implements KnowledgeUploadClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: WeKnoraKnowledgeClientOptions) {
    this.baseUrl = options.baseUrl.trim().replace(/\/+$/u, '');
    this.apiKey = options.apiKey.trim();
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(1, Number(options.timeoutMs))
      : 10_000;
    if (this.baseUrl.length === 0 || this.apiKey.length === 0) {
      throw new Error('WeKnora import configuration is incomplete');
    }
    const parsed = new URL(this.baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('WeKnora base URL must use HTTP(S)');
    }
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetch(url, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          'X-API-Key': this.apiKey,
        },
        signal: controller.signal,
      });
    } catch {
      throw new Error('WeKnora import request failed');
    } finally {
      clearTimeout(timeout);
    }
  }

  async upload(
    item: ApprovedKnowledgeItem,
    knowledgeBaseId: string,
  ): Promise<{ knowledgeId: string; parseStatus: KnowledgeParseStatus }> {
    const encodedKbId = encodeURIComponent(requiredString('knowledgeBaseId', knowledgeBaseId));
    let response: Response;
    if (item.ingestMode === 'manual') {
      response = await this.request(
        `${this.baseUrl}/knowledge-bases/${encodedKbId}/knowledge/manual`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: item.title,
            content: await readFile(item.absolutePath, 'utf8'),
            status: 'publish',
            channel: APPROVED_CHANNEL,
          }),
        },
      );
    } else {
      const bytes = await readFile(item.absolutePath);
      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array(bytes)]),
        path.basename(item.absolutePath),
      );
      form.append('channel', APPROVED_CHANNEL);
      form.append('metadata', JSON.stringify({
        title: item.title,
        source_type: item.sourceType,
        source_url: item.sourceUrl,
        published_at: item.publishedAt,
        applicable_year: item.applicableYear,
        approved_by: item.approvedBy,
        approved_at: item.approvedAt,
        content_sha256: item.contentSha256,
      }));
      response = await this.request(
        `${this.baseUrl}/knowledge-bases/${encodedKbId}/knowledge/file`,
        { method: 'POST', body: form },
      );
    }
    if (!response.ok) {
      throw new Error(`WeKnora upload failed with HTTP ${response.status}`);
    }
    const body = await response.json().catch(() => null) as {
      success?: unknown;
      data?: RawKnowledge;
    } | null;
    const knowledgeId = typeof body?.data?.id === 'string'
      ? body.data.id.trim()
      : '';
    if (body?.success !== true || knowledgeId.length === 0) {
      throw new Error('WeKnora upload returned an invalid response');
    }
    let parseStatus = normalizeParseStatus(body.data?.parse_status);
    if (item.ingestMode === 'manual' && body.data?.parse_status === 'draft') {
      const publishResponse = await this.request(
        `${this.baseUrl}/knowledge/manual/${encodeURIComponent(knowledgeId)}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: item.title,
            content: await readFile(item.absolutePath, 'utf8'),
            status: 'publish',
            channel: APPROVED_CHANNEL,
          }),
        },
      );
      if (!publishResponse.ok) {
        throw new Error(`WeKnora manual publish failed with HTTP ${publishResponse.status}`);
      }
      const publishBody = await publishResponse.json().catch(() => null) as {
        success?: unknown;
        data?: RawKnowledge;
      } | null;
      if (publishBody?.success !== true || publishBody.data?.id !== knowledgeId) {
        throw new Error('WeKnora manual publish returned an invalid response');
      }
      parseStatus = normalizeParseStatus(publishBody.data.parse_status);
    }
    return { knowledgeId, parseStatus };
  }

  async getParseState(
    knowledgeBaseId: string,
    knowledgeId: string,
  ): Promise<{ parseStatus: KnowledgeParseStatus; error: string | null }> {
    const encodedKbId = encodeURIComponent(requiredString('knowledgeBaseId', knowledgeBaseId));
    const expectedId = requiredString('knowledgeId', knowledgeId);
    const response = await this.request(
      `${this.baseUrl}/knowledge-bases/${encodedKbId}/knowledge?page=1&page_size=100`,
      { method: 'GET' },
    );
    if (!response.ok) {
      throw new Error(`WeKnora list failed with HTTP ${response.status}`);
    }
    const body = await response.json().catch(() => null) as {
      success?: unknown;
      data?: unknown;
    } | null;
    if (body?.success !== true || !Array.isArray(body.data)) {
      throw new Error('WeKnora list returned an invalid response');
    }
    const raw = body.data.find((value) => (
      typeof value === 'object'
      && value !== null
      && 'id' in value
      && value.id === expectedId
    )) as RawKnowledge | undefined;
    if (!raw) {
      return { parseStatus: 'pending', error: null };
    }
    return {
      parseStatus: normalizeParseStatus(raw.parse_status),
      error: typeof raw.error_message === 'string' && raw.error_message.trim()
        ? raw.error_message.trim()
        : null,
    };
  }
}

export interface KnowledgeImportSummary {
  created: number;
  skipped: number;
  completed: number;
  failed: number;
  items: KnowledgeImportRecord[];
}

interface KnowledgeImportServiceOptions {
  knowledgeBaseId: string;
  pollIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

export class KnowledgeImportService {
  private readonly knowledgeBaseId: string;
  private readonly pollIntervalMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;

  constructor(
    private readonly store: KnowledgeImportStore,
    private readonly client: KnowledgeUploadClient,
    options: KnowledgeImportServiceOptions,
  ) {
    this.knowledgeBaseId = requiredString('knowledgeBaseId', options.knowledgeBaseId);
    this.pollIntervalMs = Number.isFinite(options.pollIntervalMs)
      ? Math.max(1, Number(options.pollIntervalMs))
      : 2_000;
    this.sleep = options.sleep ?? (
      (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
    );
    this.now = options.now ?? Date.now;
  }

  async importManifest(
    manifestPath: string,
    options: {
      approvedRoot: string;
      wait?: boolean;
      timeoutMs?: number;
    },
  ): Promise<KnowledgeImportSummary> {
    const manifest = await validateApprovedKnowledgeManifest(
      manifestPath,
      options.approvedRoot,
    );
    const actions: ApprovedKnowledgeItem[] = [];
    let skipped = 0;
    for (const item of manifest.items) {
      const approval = await this.store.findApproval(
        manifest.manifestPath,
        item.itemPath,
        item.approvedBy,
        item.approvedAt,
      );
      if (approval && approval.contentSha256 !== item.contentSha256) {
        throw new Error(
          `approved content changed for ${item.itemPath}; create a new approval version`,
        );
      }
      if (approval || await this.store.findByHash(
        this.knowledgeBaseId,
        item.contentSha256,
      )) {
        skipped += 1;
        continue;
      }
      actions.push(item);
    }

    const imported: KnowledgeImportRecord[] = [];
    let completed = 0;
    let failed = 0;
    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(1, Number(options.timeoutMs))
      : 30 * 60_000;
    for (const item of actions) {
      const record = await this.store.createVersion({
        manifestPath: manifest.manifestPath,
        itemPath: item.itemPath,
        contentSha256: item.contentSha256,
        title: item.title,
        sourceType: item.sourceType,
        sourceUrl: item.sourceUrl,
        publishedAt: item.publishedAt,
        applicableYear: item.applicableYear,
        approvedBy: item.approvedBy,
        approvedAt: item.approvedAt,
        ingestMode: item.ingestMode,
        knowledgeBaseId: this.knowledgeBaseId,
      });
      await this.store.appendEvent(record.id, 'validated', null);
      imported.push(record);
      try {
        const upload = await this.client.upload(item, this.knowledgeBaseId);
        record.weknoraKnowledgeId = upload.knowledgeId;
        record.parseStatus = upload.parseStatus;
        await this.store.updateState(record.id, {
          weknoraKnowledgeId: upload.knowledgeId,
          parseStatus: upload.parseStatus,
          lastError: null,
        });
        await this.store.appendEvent(record.id, upload.parseStatus, null);
        if (!options.wait) {
          if (upload.parseStatus === 'completed') {
            completed += 1;
          } else if (upload.parseStatus === 'failed' || upload.parseStatus === 'cancelled') {
            failed += 1;
          }
          continue;
        }

        const deadline = this.now() + timeoutMs;
        let state = {
          parseStatus: upload.parseStatus,
          error: null as string | null,
        };
        while (!TERMINAL_PARSE_STATES.has(state.parseStatus) && this.now() < deadline) {
          state = await this.client.getParseState(
            this.knowledgeBaseId,
            upload.knowledgeId,
          );
          await this.store.updateState(record.id, {
            parseStatus: state.parseStatus,
            lastError: state.error,
          });
          await this.store.appendEvent(record.id, state.parseStatus, state.error);
          if (!TERMINAL_PARSE_STATES.has(state.parseStatus)) {
            await this.sleep(this.pollIntervalMs);
          }
        }
        if (state.parseStatus === 'completed') {
          completed += 1;
          record.parseStatus = 'completed';
        } else {
          failed += 1;
          const error = state.error ?? (
            TERMINAL_PARSE_STATES.has(state.parseStatus)
              ? `WeKnora parsing ended as ${state.parseStatus}`
              : 'Timed out waiting for WeKnora parsing'
          );
          record.parseStatus = state.parseStatus;
          record.lastError = error;
          await this.store.updateState(record.id, {
            parseStatus: state.parseStatus,
            lastError: error,
          });
          await this.store.appendEvent(record.id, state.parseStatus, error);
        }
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : 'Knowledge import failed';
        record.parseStatus = 'failed';
        record.lastError = message;
        await this.store.updateState(record.id, {
          parseStatus: 'failed',
          lastError: message,
        });
        await this.store.appendEvent(record.id, 'failed', message);
      }
    }

    return {
      created: actions.length,
      skipped,
      completed,
      failed,
      items: imported,
    };
  }

  async retry(
    id: string,
    options: {
      approvedRoot: string;
      wait?: boolean;
      timeoutMs?: number;
    },
  ): Promise<KnowledgeImportRecord> {
    const record = (await this.store.list()).find((item) => item.id === id);
    if (!record) {
      throw new Error('Knowledge import record was not found');
    }
    const manifest = await validateApprovedKnowledgeManifest(
      record.manifestPath,
      options.approvedRoot,
    );
    const approvedItem = manifest.items.find((item) => (
      item.itemPath === record.itemPath
      && item.approvedBy === record.approvedBy
      && Date.parse(item.approvedAt) === Date.parse(record.approvedAt)
    ));
    if (
      !approvedItem
      || approvedItem.contentSha256 !== record.contentSha256
      || record.knowledgeBaseId !== this.knowledgeBaseId
    ) {
      throw new Error(
        'Approved manifest no longer matches the failed import; create a new approval before retrying',
      );
    }
    if (record.parseStatus !== 'failed' && record.parseStatus !== 'cancelled') {
      throw new Error(`Knowledge import in state ${record.parseStatus} cannot be retried`);
    }

    try {
      const upload = await this.client.upload(approvedItem, this.knowledgeBaseId);
      record.weknoraKnowledgeId = upload.knowledgeId;
      record.parseStatus = upload.parseStatus;
      record.lastError = null;
      await this.store.updateState(record.id, {
        weknoraKnowledgeId: upload.knowledgeId,
        parseStatus: upload.parseStatus,
        lastError: null,
      });
      await this.store.appendEvent(record.id, upload.parseStatus, 'manual retry');
      if (!options.wait) {
        return record;
      }

      const timeoutMs = Number.isFinite(options.timeoutMs)
        ? Math.max(1, Number(options.timeoutMs))
        : 30 * 60_000;
      const deadline = this.now() + timeoutMs;
      let state = {
        parseStatus: upload.parseStatus,
        error: null as string | null,
      };
      while (!TERMINAL_PARSE_STATES.has(state.parseStatus) && this.now() < deadline) {
        state = await this.client.getParseState(
          this.knowledgeBaseId,
          upload.knowledgeId,
        );
        await this.store.updateState(record.id, {
          parseStatus: state.parseStatus,
          lastError: state.error,
        });
        await this.store.appendEvent(record.id, state.parseStatus, state.error);
        if (!TERMINAL_PARSE_STATES.has(state.parseStatus)) {
          await this.sleep(this.pollIntervalMs);
        }
      }
      if (!TERMINAL_PARSE_STATES.has(state.parseStatus)) {
        state = {
          parseStatus: 'failed',
          error: 'Timed out waiting for WeKnora parsing',
        };
      }
      record.parseStatus = state.parseStatus;
      record.lastError = state.error;
      await this.store.updateState(record.id, {
        parseStatus: state.parseStatus,
        lastError: state.error,
      });
      await this.store.appendEvent(record.id, state.parseStatus, state.error);
      return record;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Knowledge import retry failed';
      record.parseStatus = 'failed';
      record.lastError = message;
      await this.store.updateState(record.id, {
        parseStatus: 'failed',
        lastError: message,
      });
      await this.store.appendEvent(record.id, 'failed', message);
      throw error;
    }
  }
}
