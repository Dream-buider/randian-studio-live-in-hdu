import type { PostgresClient, PostgresPool } from '../db/postgres.js';
import { NotFoundError } from '../domain/errors.js';
import { assertSourceRefs, assertStringArray } from '../domain/validation.js';
import type { CanonicalAnswerVersion, PublishedQuestion, QuestionIntent, RawAnswer, SourceRef } from '../domain/models.js';
import type { ContentRepository, PublishCanonicalAnswerInput } from './contracts.js';

type Row = Record<string, unknown>;

function parseJson<T>(value: unknown): T {
  return typeof value === 'string' ? JSON.parse(value) as T : value as T;
}
function asIntent(row: Row): QuestionIntent {
  return { id: String(row.id), externalId: row.external_id === null ? null : String(row.external_id), category: String(row.category), question: String(row.question), intentDescription: String(row.intent_description), aliases: parseJson<string[]>(row.aliases_json), keywords: parseJson<string[]>(row.keywords_json), excludeKeywords: parseJson<string[]>(row.exclude_keywords_json), active: Boolean(row.active), featured: Boolean(row.featured), displayOrder: Number(row.display_order) };
}
function asCanonical(row: Row): CanonicalAnswerVersion {
  return { id: String(row.id), intentId: String(row.intent_id), version: Number(row.version), summary: String(row.summary), fullAnswer: String(row.full_answer), sources: parseJson<SourceRef[]>(row.sources_json), status: String(row.status) as CanonicalAnswerVersion['status'], reviewerId: String(row.reviewer_id), publishedAt: row.published_at === null ? null : String(row.published_at), updatedAt: String(row.updated_at) };
}

export class PostgresContentRepository implements ContentRepository {
  private readonly pool: PostgresPool;

  constructor(pool: PostgresPool) {
    this.pool = pool;
  }

  private async writeIntent(client: PostgresClient, input: QuestionIntent): Promise<void> {
    assertStringArray('aliases', input.aliases); assertStringArray('keywords', input.keywords); assertStringArray('excludeKeywords', input.excludeKeywords);
    await client.query(`INSERT INTO question_intents (id, external_id, category, question, intent_description, aliases_json, keywords_json, exclude_keywords_json, active, featured, display_order, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,NOW(),NOW())
      ON CONFLICT (id) DO UPDATE SET external_id=EXCLUDED.external_id, category=EXCLUDED.category, question=EXCLUDED.question, intent_description=EXCLUDED.intent_description, aliases_json=EXCLUDED.aliases_json, keywords_json=EXCLUDED.keywords_json, exclude_keywords_json=EXCLUDED.exclude_keywords_json, active=EXCLUDED.active, featured=EXCLUDED.featured, display_order=EXCLUDED.display_order, updated_at=NOW()`,
      [input.id,input.externalId,input.category,input.question,input.intentDescription,JSON.stringify(input.aliases),JSON.stringify(input.keywords),JSON.stringify(input.excludeKeywords),input.active,input.featured,input.displayOrder]);
    await client.query('DELETE FROM intent_aliases WHERE intent_id = $1', [input.id]);
    for (const alias of input.aliases) await client.query('INSERT INTO intent_aliases (intent_id, alias) VALUES ($1, $2)', [input.id, alias]);
  }

  async createIntent(input: QuestionIntent): Promise<void> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); await this.writeIntent(client, input); await client.query('COMMIT'); }
    catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async upsertRawAnswers(items: RawAnswer[]): Promise<number> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); let inserted = 0; for (const item of items) { const result = await client.query('INSERT INTO raw_answers (id, intent_id, answer_text, source_label, source_cell, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING', [item.id,item.intentId,item.answer,item.sourceLabel,item.sourceCell,item.createdAt]); inserted += result.rowCount ?? 0; } await client.query('COMMIT'); return inserted; }
    catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async listPublishedQuestions(): Promise<PublishedQuestion[]> {
    const result = await this.pool.query(`SELECT qi.id, qi.category, qi.question, qi.featured, qi.display_order, ca.summary, ca.full_answer, ca.sources_json, ca.updated_at FROM question_intents qi JOIN LATERAL (SELECT * FROM canonical_answers WHERE intent_id=qi.id AND status='published' ORDER BY version DESC LIMIT 1) ca ON TRUE WHERE qi.active=TRUE ORDER BY qi.featured DESC, qi.display_order ASC, qi.category ASC, qi.question ASC`);
    return result.rows.map((row: Row) => ({ id:String(row.id), category:String(row.category), question:String(row.question), summary:String(row.summary), fullAnswer:String(row.full_answer), sources:parseJson<SourceRef[]>(row.sources_json), trustStatus:'approved', updatedAt:String(row.updated_at), featured:Boolean(row.featured), displayOrder:Number(row.display_order) }));
  }

  async getIntentCatalog(): Promise<QuestionIntent[]> { const result = await this.pool.query('SELECT * FROM question_intents ORDER BY category ASC, display_order ASC, question ASC'); return result.rows.map((row: Row) => asIntent(row)); }

  async publishCanonicalAnswer(input: PublishCanonicalAnswerInput): Promise<CanonicalAnswerVersion> {
    assertSourceRefs(input.sources); const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const exists = await client.query('SELECT id FROM question_intents WHERE id = $1 FOR SHARE', [input.intentId]);
      if (exists.rowCount !== 1) throw new NotFoundError(`Question intent not found: ${input.intentId}`);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.intentId]);
      const versionRow = await client.query('SELECT COALESCE(MAX(version), 0) AS version FROM canonical_answers WHERE intent_id = $1', [input.intentId]);
      const version = Number(versionRow.rows[0]?.version ?? 0) + 1; const id = `${input.intentId}:v${version}`;
      const inserted = await client.query(`INSERT INTO canonical_answers (id,intent_id,version,summary,full_answer,sources_json,status,reviewer_id,published_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,'published',$7,NOW(),NOW()) RETURNING *`, [id,input.intentId,version,input.summary,input.fullAnswer,JSON.stringify(input.sources),input.reviewerId]);
      for (const [position, source] of input.sources.entries()) await client.query('INSERT INTO canonical_answer_sources (canonical_answer_id,position,source_type,title,url,updated_at) VALUES ($1,$2,$3,$4,$5,$6)', [id,position,source.type,source.title,source.url,source.updatedAt]);
      await client.query('COMMIT');
      return asCanonical(inserted.rows[0] as Row);
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async listRawAnswers(intentId: string): Promise<RawAnswer[]> { const result = await this.pool.query('SELECT id,intent_id,answer_text,source_label,source_cell,created_at FROM raw_answers WHERE intent_id = $1 ORDER BY created_at ASC, id ASC', [intentId]); return result.rows.map((row: Row) => ({ id:String(row.id), intentId:String(row.intent_id), answer:String(row.answer_text), sourceLabel:String(row.source_label), sourceCell:String(row.source_cell), createdAt:String(row.created_at) })); }
}
