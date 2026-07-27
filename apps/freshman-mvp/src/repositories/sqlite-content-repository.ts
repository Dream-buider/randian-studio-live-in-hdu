import type { SqliteDatabase } from '../db/sqlite.js';
import { NotFoundError } from '../domain/errors.js';
import type {
  CanonicalAnswerVersion,
  PublishedQuestion,
  QuestionIntent,
  RawAnswer,
  SourceRef,
} from '../domain/models.js';
import type { ContentRepository, PublishCanonicalAnswerInput } from './contracts.js';

type Row = Record<string, unknown>;

function parseStringArray(value: unknown): string[] {
  return JSON.parse(String(value)) as string[];
}

function parseSources(value: unknown): SourceRef[] {
  return JSON.parse(String(value)) as SourceRef[];
}

function asIntent(row: Row): QuestionIntent {
  return {
    id: String(row.id),
    externalId: row.external_id === null ? null : String(row.external_id),
    category: String(row.category),
    question: String(row.question),
    intentDescription: String(row.intent_description),
    aliases: parseStringArray(row.aliases_json),
    keywords: parseStringArray(row.keywords_json),
    excludeKeywords: parseStringArray(row.exclude_keywords_json),
    active: Number(row.active) === 1,
    featured: Number(row.featured) === 1,
    displayOrder: Number(row.display_order),
  };
}

function asCanonicalAnswer(row: Row): CanonicalAnswerVersion {
  return {
    id: String(row.id),
    intentId: String(row.intent_id),
    version: Number(row.version),
    summary: String(row.summary),
    fullAnswer: String(row.full_answer),
    sources: parseSources(row.sources_json),
    status: String(row.status) as CanonicalAnswerVersion['status'],
    reviewerId: String(row.reviewer_id),
    publishedAt: row.published_at === null ? null : String(row.published_at),
    updatedAt: String(row.updated_at),
  };
}

export class SqliteContentRepository implements ContentRepository {
  private readonly database: SqliteDatabase;

  constructor(database: SqliteDatabase) {
    this.database = database;
  }

  async createIntent(input: QuestionIntent): Promise<void> {
    const now = new Date().toISOString();
    const aliases = JSON.stringify(input.aliases);
    const keywords = JSON.stringify(input.keywords);
    const excludeKeywords = JSON.stringify(input.excludeKeywords);

    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare(`
        INSERT INTO question_intents (
          id, external_id, category, question, intent_description, aliases_json,
          keywords_json, exclude_keywords_json, active, featured, display_order,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          external_id = excluded.external_id,
          category = excluded.category,
          question = excluded.question,
          intent_description = excluded.intent_description,
          aliases_json = excluded.aliases_json,
          keywords_json = excluded.keywords_json,
          exclude_keywords_json = excluded.exclude_keywords_json,
          active = excluded.active,
          featured = excluded.featured,
          display_order = excluded.display_order,
          updated_at = excluded.updated_at
      `).run(
        input.id,
        input.externalId,
        input.category,
        input.question,
        input.intentDescription,
        aliases,
        keywords,
        excludeKeywords,
        Number(input.active),
        Number(input.featured),
        input.displayOrder,
        now,
        now,
      );
      this.database.prepare('DELETE FROM intent_aliases WHERE intent_id = ?').run(input.id);
      const insertAlias = this.database.prepare(
        'INSERT INTO intent_aliases (intent_id, alias) VALUES (?, ?)',
      );
      for (const alias of input.aliases) {
        insertAlias.run(input.id, alias);
      }
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  async upsertRawAnswers(items: RawAnswer[]): Promise<number> {
    let inserted = 0;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const statement = this.database.prepare(`
        INSERT INTO raw_answers (id, intent_id, answer_text, source_label, source_cell, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `);
      for (const item of items) {
        const result = statement.run(
          item.id,
          item.intentId,
          item.answer,
          item.sourceLabel,
          item.sourceCell,
          item.createdAt,
        );
        inserted += Number(result.changes);
      }
      this.database.exec('COMMIT');
      return inserted;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  async listPublishedQuestions(): Promise<PublishedQuestion[]> {
    const rows = this.database.prepare(`
      SELECT
        qi.id, qi.category, qi.question, qi.featured, qi.display_order,
        ca.summary, ca.full_answer, ca.sources_json, ca.updated_at
      FROM question_intents qi
      JOIN canonical_answers ca ON ca.intent_id = qi.id
      WHERE qi.active = 1
        AND ca.status = 'published'
        AND ca.version = (
          SELECT MAX(version)
          FROM canonical_answers newer
          WHERE newer.intent_id = qi.id AND newer.status = 'published'
        )
      ORDER BY qi.featured DESC, qi.category ASC, qi.display_order ASC, qi.question ASC
    `).all() as Row[];

    return rows.map((row) => ({
      id: String(row.id),
      category: String(row.category),
      question: String(row.question),
      summary: String(row.summary),
      fullAnswer: String(row.full_answer),
      sources: parseSources(row.sources_json),
      trustStatus: 'approved',
      updatedAt: String(row.updated_at),
      featured: Number(row.featured) === 1,
      displayOrder: Number(row.display_order),
    }));
  }

  async getIntentCatalog(): Promise<QuestionIntent[]> {
    const rows = this.database.prepare(`
      SELECT * FROM question_intents
      ORDER BY category ASC, display_order ASC, question ASC
    `).all() as Row[];
    return rows.map(asIntent);
  }

  async publishCanonicalAnswer(
    input: PublishCanonicalAnswerInput,
  ): Promise<CanonicalAnswerVersion> {
    const now = new Date().toISOString();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const intent = this.database.prepare(
        'SELECT id FROM question_intents WHERE id = ?',
      ).get(input.intentId) as Row | undefined;
      if (!intent) {
        throw new NotFoundError(`Question intent not found: ${input.intentId}`);
      }
      const versionRow = this.database.prepare(
        'SELECT COALESCE(MAX(version), 0) AS version FROM canonical_answers WHERE intent_id = ?',
      ).get(input.intentId) as Row;
      const version = Number(versionRow.version) + 1;
      const id = `${input.intentId}:v${version}`;
      const sourcesJson = JSON.stringify(input.sources);

      this.database.prepare(`
        INSERT INTO canonical_answers (
          id, intent_id, version, summary, full_answer, sources_json, status,
          reviewer_id, published_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)
      `).run(id, input.intentId, version, input.summary, input.fullAnswer, sourcesJson, input.reviewerId, now, now);
      const insertSource = this.database.prepare(`
        INSERT INTO canonical_answer_sources (
          canonical_answer_id, position, source_type, title, url, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      input.sources.forEach((source, position) => {
        insertSource.run(id, position, source.type, source.title, source.url, source.updatedAt);
      });
      this.database.exec('COMMIT');
      return {
        id,
        intentId: input.intentId,
        version,
        summary: input.summary,
        fullAnswer: input.fullAnswer,
        sources: input.sources,
        status: 'published',
        reviewerId: input.reviewerId,
        publishedAt: now,
        updatedAt: now,
      };
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  async listRawAnswers(intentId: string): Promise<RawAnswer[]> {
    const rows = this.database.prepare(`
      SELECT id, intent_id, answer_text, source_label, source_cell, created_at
      FROM raw_answers
      WHERE intent_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(intentId) as Row[];
    return rows.map((row) => ({
      id: String(row.id),
      intentId: String(row.intent_id),
      answer: String(row.answer_text),
      sourceLabel: String(row.source_label),
      sourceCell: String(row.source_cell),
      createdAt: String(row.created_at),
    }));
  }
}
