import { randomUUID } from 'node:crypto';
import type { PostgresPool } from '../db/postgres.js';
import { ConflictError, NotFoundError } from '../domain/errors.js';
import { assertSourceRefs } from '../domain/validation.js';
import type { ReviewStatus, ReviewTask, SourceRef } from '../domain/models.js';
import type { EnqueueReviewInput, ReviewDecision, ReviewRepository } from './contracts.js';

type Row = Record<string, unknown>;
function parseJson<T>(value: unknown): T { return typeof value === 'string' ? JSON.parse(value) as T : value as T; }
function timestamp(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
function asReviewTask(row: Row): ReviewTask { return { id:String(row.id), question:String(row.question), answer:String(row.answer_text), sources:parseJson<SourceRef[]>(row.sources_json), riskLevel:String(row.risk_level) as ReviewTask['riskLevel'], status:String(row.status) as ReviewStatus, ordinal:Number(row.ordinal), createdAt:timestamp(row.created_at), decidedAt:row.decided_at === null ? null : timestamp(row.decided_at), reviewerId:row.reviewer_id === null ? null : String(row.reviewer_id), decisionNote:row.decision_note === null ? null : String(row.decision_note), reviewedAnswer:row.reviewed_answer === null ? null : String(row.reviewed_answer), feedbackTarget:row.feedback_target === null ? null : String(row.feedback_target), providerStatus:row.provider_status === null || row.provider_status === undefined ? null : String(row.provider_status) as ReviewTask['providerStatus'], rawSearchLeads:row.raw_search_leads_json === null || row.raw_search_leads_json === undefined ? [] : parseJson<ReviewTask['rawSearchLeads']>(row.raw_search_leads_json) }; }

export class PostgresReviewRepository implements ReviewRepository {
  private readonly pool: PostgresPool;

  constructor(pool: PostgresPool) {
    this.pool = pool;
  }
  async enqueue(input: EnqueueReviewInput): Promise<ReviewTask> {
    assertSourceRefs(input.sources); const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`INSERT INTO review_tasks (id,question,answer_text,sources_json,risk_level,status,ordinal,created_at,decided_at,reviewer_id,decision_note,reviewed_answer,feedback_target,provider_status,raw_search_leads_json) VALUES ($1,$2,$3,$4::jsonb,'medium','pending',nextval('review_ordinal_seq'),NOW(),NULL,NULL,NULL,NULL,NULL,$5,$6::jsonb) RETURNING *`, [randomUUID(),input.question,input.answer,JSON.stringify(input.sources),input.providerStatus ?? null,JSON.stringify(input.rawSearchLeads ?? [])]);
      await client.query('COMMIT'); return asReviewTask(result.rows[0] as Row);
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async list(status?: ReviewStatus): Promise<ReviewTask[]> { const result = status === undefined ? await this.pool.query('SELECT * FROM review_tasks ORDER BY created_at ASC, ordinal ASC') : await this.pool.query('SELECT * FROM review_tasks WHERE status = $1 ORDER BY created_at ASC, ordinal ASC', [status]); return result.rows.map((row: Row) => asReviewTask(row)); }
  async decide(id: string, decision: ReviewDecision): Promise<ReviewTask> {
    const result = await this.pool.query(`UPDATE review_tasks SET status=$1,reviewer_id=$2,decision_note=$3,reviewed_answer=$4,feedback_target=$5,decided_at=NOW() WHERE id=$6 AND status='pending' RETURNING *`, [decision.status,decision.reviewerId,decision.note,decision.reviewedAnswer,decision.feedbackTarget,id]);
    if (result.rowCount === 1) return asReviewTask(result.rows[0] as Row);
    const existing = await this.pool.query('SELECT status FROM review_tasks WHERE id = $1', [id]); if (existing.rowCount === 0) throw new NotFoundError('Review task not found'); throw new ConflictError('Review task has already been decided');
  }
}
