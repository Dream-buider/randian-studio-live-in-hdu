import { randomUUID } from 'node:crypto';
import type { PostgresPool } from '../db/postgres.js';
import type {
  FaqOutboxEvent,
  FaqPayload,
  FaqSyncStore,
} from '../services/faq-sync-service.js';

type Row = Record<string, unknown>;

function parseJson<T>(value: unknown): T {
  return typeof value === 'string' ? JSON.parse(value) as T : value as T;
}

function asEvent(row: Row): FaqOutboxEvent {
  return {
    id: String(row.id),
    intentId: String(row.intent_id),
    canonicalVersion: Number(row.canonical_version),
    idempotencyKey: String(row.idempotency_key),
    status: String(row.status) as FaqOutboxEvent['status'],
    attempts: Number(row.attempts),
    lastError: row.last_error === null || row.last_error === undefined
      ? null
      : String(row.last_error),
    payload: parseJson<FaqPayload>(row.payload_json),
  };
}

export interface FaqSyncStoreCounts {
  counts(): Promise<{ pending: number; failed: number }>;
}

export class PostgresFaqSyncStore implements FaqSyncStore, FaqSyncStoreCounts {
  constructor(private readonly pool: PostgresPool) {}

  async enqueuePublishedVersion(
    intentId: string,
    canonicalVersion: number,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO integration_outbox (
        id, event_type, intent_id, canonical_version, idempotency_key,
        payload_json, status, attempts, available_at, created_at, updated_at
      )
      SELECT $1, 'weknora-faq-upsert', qi.id, ca.version, $2,
        jsonb_build_object(
          'standardQuestion', qi.question,
          'similarQuestions', qi.aliases_json,
          'negativeQuestions', qi.exclude_keywords_json,
          'answers', jsonb_build_array(ca.full_answer),
          'isEnabled', TRUE,
          'isRecommended', qi.featured
        ),
        'pending', 0, NOW(), NOW(), NOW()
      FROM question_intents qi
      JOIN canonical_answers ca ON ca.intent_id = qi.id
      WHERE qi.id = $3 AND ca.version = $4 AND ca.status = 'published'
      ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        randomUUID(),
        `${intentId}:${canonicalVersion}:weknora-faq`,
        intentId,
        canonicalVersion,
      ],
    );
  }

  async claimBatch(limit: number): Promise<FaqOutboxEvent[]> {
    const bounded = Math.max(1, Math.min(Math.floor(limit), 10));
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `WITH candidates AS (
          SELECT id
          FROM integration_outbox
          WHERE status = 'pending'
            AND available_at <= NOW()
            AND (leased_until IS NULL OR leased_until < NOW())
          ORDER BY created_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        )
        UPDATE integration_outbox target
        SET status = 'processing',
            attempts = target.attempts + 1,
            leased_until = NOW() + INTERVAL '30 seconds',
            updated_at = NOW()
        FROM candidates
        WHERE target.id = candidates.id
        RETURNING target.*`,
        [bounded],
      );
      await client.query('COMMIT');
      return result.rows.map(asEvent);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async complete(eventId: string, seqId: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO external_content_links (
          intent_id, provider, external_seq_id, updated_at
        )
        SELECT intent_id, 'weknora-faq', $2, NOW()
        FROM integration_outbox WHERE id = $1
        ON CONFLICT (intent_id, provider) DO UPDATE SET
          external_seq_id = EXCLUDED.external_seq_id,
          updated_at = NOW()`,
        [eventId, seqId],
      );
      await client.query(
        `UPDATE integration_outbox
         SET status='completed', leased_until=NULL, last_error=NULL, updated_at=NOW()
         WHERE id=$1 AND status='processing'`,
        [eventId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async fail(eventId: string, safeMessage: string): Promise<void> {
    await this.pool.query(
      `UPDATE integration_outbox
       SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
           available_at = NOW() + (
             LEAST(300, POWER(2, GREATEST(attempts, 1))::integer) * INTERVAL '1 second'
           ),
           leased_until = NULL,
           last_error = $2,
           updated_at = NOW()
       WHERE id = $1 AND status = 'processing'`,
      [eventId, safeMessage],
    );
  }

  async retry(eventId: string): Promise<void> {
    await this.pool.query(
      `UPDATE integration_outbox
       SET status='pending', available_at=NOW(), leased_until=NULL,
           last_error=NULL, updated_at=NOW()
       WHERE id=$1 AND status='failed'`,
      [eventId],
    );
  }

  async linkedSeqId(intentId: string): Promise<number | null> {
    const result = await this.pool.query(
      `SELECT external_seq_id
       FROM external_content_links
       WHERE intent_id=$1 AND provider='weknora-faq'`,
      [intentId],
    );
    if (result.rowCount !== 1) {
      return null;
    }
    const value = Number(result.rows[0]?.external_seq_id);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  async counts(): Promise<{ pending: number; failed: number }> {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status IN ('pending', 'processing')) AS pending,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed
       FROM integration_outbox`,
    );
    return {
      pending: Number(result.rows[0]?.pending ?? 0),
      failed: Number(result.rows[0]?.failed ?? 0),
    };
  }
}
