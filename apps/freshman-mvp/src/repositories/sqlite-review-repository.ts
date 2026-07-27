import { randomUUID } from 'node:crypto';
import type { SqliteDatabase } from '../db/sqlite.js';
import { NotFoundError } from '../domain/errors.js';
import { assertSourceRefs } from '../domain/validation.js';
import type { ReviewStatus, ReviewTask, SourceRef } from '../domain/models.js';
import type {
  EnqueueReviewInput,
  ReviewDecision,
  ReviewRepository,
} from './contracts.js';

type Row = Record<string, unknown>;

function asReviewTask(row: Row): ReviewTask {
  return {
    id: String(row.id),
    question: String(row.question),
    answer: String(row.answer_text),
    sources: JSON.parse(String(row.sources_json)) as SourceRef[],
    riskLevel: String(row.risk_level) as ReviewTask['riskLevel'],
    status: String(row.status) as ReviewStatus,
    ordinal: Number(row.ordinal),
    createdAt: String(row.created_at),
    decidedAt: row.decided_at === null ? null : String(row.decided_at),
    reviewerId: row.reviewer_id === null ? null : String(row.reviewer_id),
    decisionNote: row.decision_note === null ? null : String(row.decision_note),
    reviewedAnswer: row.reviewed_answer === null ? null : String(row.reviewed_answer),
    feedbackTarget: row.feedback_target === null ? null : String(row.feedback_target),
  };
}

export class SqliteReviewRepository implements ReviewRepository {
  private readonly database: SqliteDatabase;

  constructor(database: SqliteDatabase) {
    this.database = database;
  }

  async enqueue(input: EnqueueReviewInput): Promise<ReviewTask> {
    assertSourceRefs(input.sources);
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const ordinalRow = this.database.prepare(
        'SELECT COALESCE(MAX(ordinal), 0) + 1 AS ordinal FROM review_tasks',
      ).get() as Row;
      const ordinal = Number(ordinalRow.ordinal);
      this.database.prepare(`
        INSERT INTO review_tasks (
          id, question, answer_text, sources_json, risk_level, status, ordinal,
          created_at, decided_at, reviewer_id, decision_note
        ) VALUES (?, ?, ?, ?, 'medium', 'pending', ?, ?, NULL, NULL, NULL)
      `).run(id, input.question, input.answer, JSON.stringify(input.sources), ordinal, createdAt);
      this.database.exec('COMMIT');
      return {
        id,
        question: input.question,
        answer: input.answer,
        sources: input.sources,
        riskLevel: 'medium',
        status: 'pending',
        ordinal,
        createdAt,
        decidedAt: null,
        reviewerId: null,
        decisionNote: null,
        reviewedAnswer: null,
        feedbackTarget: null,
      };
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  async list(status?: ReviewStatus): Promise<ReviewTask[]> {
    const rows = status === undefined
      ? this.database.prepare(`
          SELECT * FROM review_tasks ORDER BY created_at ASC, ordinal ASC
        `).all() as Row[]
      : this.database.prepare(`
          SELECT * FROM review_tasks WHERE status = ? ORDER BY created_at ASC, ordinal ASC
        `).all(status) as Row[];
    return rows.map(asReviewTask);
  }

  async decide(id: string, decision: ReviewDecision): Promise<ReviewTask> {
    const decidedAt = new Date().toISOString();
    const result = this.database.prepare(`
      UPDATE review_tasks
      SET status = ?, reviewer_id = ?, decision_note = ?, reviewed_answer = ?, feedback_target = ?, decided_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(
      decision.status,
      decision.reviewerId,
      decision.note,
      decision.reviewedAnswer,
      decision.feedbackTarget,
      decidedAt,
      id,
    );
    if (Number(result.changes) !== 1) {
      throw new NotFoundError(`Pending review task not found: ${id}`);
    }
    const row = this.database.prepare('SELECT * FROM review_tasks WHERE id = ?').get(id) as Row;
    return asReviewTask(row);
  }
}
