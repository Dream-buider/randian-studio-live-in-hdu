import type { SqliteDatabase } from '../db/sqlite.js';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors.js';
import type { SourceRef } from '../domain/models.js';
import { assertSourceRefs } from '../domain/validation.js';
import type {
  ApprovedReviewPublicationResult,
  ApprovedReviewPublisher,
  ReviewDecision,
} from './contracts.js';
import { sqliteRowToReviewTask } from './sqlite-review-repository.js';

type Row = Record<string, unknown>;

function normalizeQuestion(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/gu, '')
    .replace(/[?？]+$/gu, '')
    .toLocaleLowerCase('zh-CN');
}

function summaryFromAnswer(value: string): string {
  const paragraph = value
    .split(/\r?\n/u)
    .map((part) => part.trim())
    .find(Boolean) ?? value.trim();
  return Array.from(paragraph).slice(0, 150).join('');
}

export class SqliteApprovedReviewPublisher implements ApprovedReviewPublisher {
  constructor(private readonly database: SqliteDatabase) {}

  async publish(
    reviewId: string,
    decision: ReviewDecision,
  ): Promise<ApprovedReviewPublicationResult> {
    if (decision.status !== 'approved') {
      throw new ValidationError('Only approved reviews can be published');
    }
    const reviewedAnswer = decision.reviewedAnswer?.trim() ?? '';
    if (!reviewedAnswer) {
      throw new ValidationError('reviewedAnswer is required for publication');
    }

    const now = new Date().toISOString();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const reviewRow = this.database.prepare(
        'SELECT * FROM review_tasks WHERE id = ?',
      ).get(reviewId) as Row | undefined;
      if (!reviewRow) {
        throw new NotFoundError('Review task not found');
      }
      if (String(reviewRow.status) !== 'pending') {
        throw new ConflictError('Review task has already been decided');
      }

      const question = String(reviewRow.question).trim();
      const sources = JSON.parse(String(reviewRow.sources_json)) as SourceRef[];
      assertSourceRefs(sources);
      const existingIntents = this.database.prepare(
        'SELECT id, question FROM question_intents',
      ).all() as Row[];
      const existing = existingIntents.find(
        (intent) => normalizeQuestion(String(intent.question)) === normalizeQuestion(question),
      );
      const createdIntent = existing === undefined;
      const intentId = existing ? String(existing.id) : `review-${reviewId}`;

      if (createdIntent) {
        const orderRow = this.database.prepare(
          'SELECT COALESCE(MAX(display_order), 0) + 1 AS display_order FROM question_intents',
        ).get() as Row;
        this.database.prepare(`
          INSERT INTO question_intents (
            id, external_id, category, question, intent_description,
            aliases_json, keywords_json, exclude_keywords_json,
            active, featured, display_order, created_at, updated_at
          ) VALUES (?, NULL, '补充问答', ?, ?, ?, '[]', '[]', 1, 0, ?, ?, ?)
        `).run(
          intentId,
          question,
          question,
          JSON.stringify([question]),
          Number(orderRow.display_order),
          now,
          now,
        );
        this.database.prepare(
          'INSERT INTO intent_aliases (intent_id, alias) VALUES (?, ?)',
        ).run(intentId, question);
      }

      const versionRow = this.database.prepare(
        'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM canonical_answers WHERE intent_id = ?',
      ).get(intentId) as Row;
      const version = Number(versionRow.version);
      const answerId = `${intentId}:v${version}`;
      this.database.prepare(`
        INSERT INTO canonical_answers (
          id, intent_id, version, summary, full_answer, sources_json, status,
          reviewer_id, published_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)
      `).run(
        answerId,
        intentId,
        version,
        summaryFromAnswer(reviewedAnswer),
        reviewedAnswer,
        JSON.stringify(sources),
        decision.reviewerId,
        now,
        now,
      );
      const insertSource = this.database.prepare(`
        INSERT INTO canonical_answer_sources (
          canonical_answer_id, position, source_type, title, url, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      sources.forEach((source, position) => {
        insertSource.run(
          answerId,
          position,
          source.type,
          source.title,
          source.url,
          source.updatedAt,
        );
      });

      const update = this.database.prepare(`
        UPDATE review_tasks
        SET status = 'approved', reviewer_id = ?, decision_note = ?,
            reviewed_answer = ?, feedback_target = ?, decided_at = ?
        WHERE id = ? AND status = 'pending'
      `).run(
        decision.reviewerId,
        decision.note,
        reviewedAnswer,
        decision.feedbackTarget,
        now,
        reviewId,
      );
      if (Number(update.changes) !== 1) {
        throw new ConflictError('Review task has already been decided');
      }

      const decidedRow = this.database.prepare(
        'SELECT * FROM review_tasks WHERE id = ?',
      ).get(reviewId) as Row;
      this.database.exec('COMMIT');
      return {
        review: sqliteRowToReviewTask(decidedRow),
        intentId,
        version,
        createdIntent,
      };
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}
