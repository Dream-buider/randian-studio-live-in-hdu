import { randomUUID } from 'node:crypto';
import type { PostgresClient, PostgresPool } from '../db/postgres.js';
import type {
  KnowledgeImportRecord,
  KnowledgeImportStore,
  KnowledgeParseStatus,
} from '../services/knowledge-import-service.js';

function isoTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(String(value)).toISOString();
}

function calendarDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function mapRecord(row: Record<string, unknown>): KnowledgeImportRecord {
  return {
    id: String(row.id),
    manifestPath: String(row.manifest_path),
    itemPath: String(row.item_path),
    version: Number(row.version),
    contentSha256: String(row.content_sha256),
    title: String(row.title),
    sourceType: String(row.source_type) as KnowledgeImportRecord['sourceType'],
    sourceUrl: String(row.source_url),
    publishedAt: calendarDate(row.published_at),
    applicableYear: Number(row.applicable_year),
    approvedBy: String(row.approved_by),
    approvedAt: isoTimestamp(row.approved_at),
    ingestMode: String(row.ingest_mode) as KnowledgeImportRecord['ingestMode'],
    knowledgeBaseId: String(row.knowledge_base_id),
    weknoraKnowledgeId: row.weknora_knowledge_id === null
      ? null
      : String(row.weknora_knowledge_id),
    parseStatus: String(row.parse_status) as KnowledgeParseStatus,
    lastError: row.last_error === null ? null : String(row.last_error),
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at),
  };
}

const RETURNING_COLUMNS = `
  id, manifest_path, item_path, version, content_sha256, title,
  source_type, source_url, published_at, applicable_year,
  approved_by, approved_at, ingest_mode, knowledge_base_id,
  weknora_knowledge_id, parse_status, last_error, created_at, updated_at
`;

export class PostgresKnowledgeImportStore implements KnowledgeImportStore {
  constructor(private readonly pool: PostgresPool) {}

  async list(): Promise<KnowledgeImportRecord[]> {
    const result = await this.pool.query(
      `SELECT ${RETURNING_COLUMNS}
       FROM knowledge_imports
       ORDER BY updated_at DESC, item_path, version DESC`,
    );
    return result.rows.map(mapRecord);
  }

  async findByHash(
    knowledgeBaseId: string,
    contentSha256: string,
  ): Promise<KnowledgeImportRecord | null> {
    const result = await this.pool.query(
      `SELECT ${RETURNING_COLUMNS}
       FROM knowledge_imports
       WHERE knowledge_base_id = $1 AND content_sha256 = $2
       LIMIT 1`,
      [knowledgeBaseId, contentSha256],
    );
    return result.rows[0] ? mapRecord(result.rows[0]) : null;
  }

  async findApproval(
    manifestPath: string,
    itemPath: string,
    approvedBy: string,
    approvedAt: string,
  ): Promise<KnowledgeImportRecord | null> {
    const result = await this.pool.query(
      `SELECT ${RETURNING_COLUMNS}
       FROM knowledge_imports
       WHERE manifest_path = $1
         AND item_path = $2
         AND approved_by = $3
         AND approved_at = $4::timestamptz
       LIMIT 1`,
      [manifestPath, itemPath, approvedBy, approvedAt],
    );
    return result.rows[0] ? mapRecord(result.rows[0]) : null;
  }

  async createVersion(
    input: Omit<
      KnowledgeImportRecord,
      'id' | 'version' | 'weknoraKnowledgeId' | 'parseStatus'
      | 'lastError' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<KnowledgeImportRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const latest = await client.query(
        `SELECT version
         FROM knowledge_imports
         WHERE manifest_path = $1 AND item_path = $2
         ORDER BY version DESC
         LIMIT 1
         FOR UPDATE`,
        [input.manifestPath, input.itemPath],
      );
      const version = Number(latest.rows[0]?.version ?? 0) + 1;
      const result = await client.query(
        `INSERT INTO knowledge_imports (
           id, manifest_path, item_path, version, content_sha256, title,
           source_type, source_url, published_at, applicable_year,
           approved_by, approved_at, ingest_mode, channel, knowledge_base_id,
           weknora_knowledge_id, parse_status, last_error, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9::date, $10,
           $11, $12::timestamptz, $13, 'live-in-hdu-approved', $14,
           NULL, 'validated', NULL, NOW(), NOW()
         )
         RETURNING ${RETURNING_COLUMNS}`,
        [
          randomUUID(),
          input.manifestPath,
          input.itemPath,
          version,
          input.contentSha256,
          input.title,
          input.sourceType,
          input.sourceUrl,
          input.publishedAt,
          input.applicableYear,
          input.approvedBy,
          input.approvedAt,
          input.ingestMode,
          input.knowledgeBaseId,
        ],
      );
      await client.query('COMMIT');
      if (!result.rows[0]) {
        throw new Error('Knowledge import record was not created');
      }
      return mapRecord(result.rows[0]);
    } catch (error) {
      await this.rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateState(
    id: string,
    input: {
      weknoraKnowledgeId?: string;
      parseStatus: KnowledgeParseStatus;
      lastError: string | null;
    },
  ): Promise<void> {
    await this.pool.query(
      `UPDATE knowledge_imports
       SET weknora_knowledge_id = COALESCE($2, weknora_knowledge_id),
           parse_status = $3,
           last_error = $4,
           updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        input.weknoraKnowledgeId ?? null,
        input.parseStatus,
        input.lastError,
      ],
    );
  }

  async appendEvent(
    importId: string,
    status: KnowledgeParseStatus,
    detail: string | null,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO knowledge_import_events (
         id, import_id, status, detail, created_at
       ) VALUES ($1, $2, $3, $4, NOW())`,
      [randomUUID(), importId, status, detail],
    );
  }

  private async rollback(client: PostgresClient): Promise<void> {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original database error.
    }
  }
}
