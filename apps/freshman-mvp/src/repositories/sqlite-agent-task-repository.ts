import type { SqliteDatabase } from '../db/sqlite.js';
import type { AgentTask } from '../domain/agent-task.js';
import { NotFoundError } from '../domain/errors.js';
import type { AgentTaskRepository, AgentTaskSaveExpectation } from './agent-task-repository.js';

export class SqliteAgentTaskRepository implements AgentTaskRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async create(task: AgentTask): Promise<void> {
    this.database.prepare(`
      INSERT INTO agent_tasks (
        id, scenario, status, execution_approval, execution_lease_token, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.id,
      task.scenario,
      task.status,
      task.executionApproval,
      task.executionLeaseToken ?? null,
      JSON.stringify(task),
      task.createdAt,
      task.updatedAt,
    );
  }

  async getById(id: string): Promise<AgentTask | null> {
    const row = this.database.prepare(
      'SELECT payload_json FROM agent_tasks WHERE id = ?',
    ).get(id) as { payload_json: string } | undefined;
    return row ? JSON.parse(row.payload_json) as AgentTask : null;
  }

  async save(task: AgentTask): Promise<void> {
    const result = this.database.prepare(`
      UPDATE agent_tasks
      SET status = ?, execution_approval = ?, execution_lease_token = ?, payload_json = ?, updated_at = ?
      WHERE id = ?
    `).run(task.status, task.executionApproval, task.executionLeaseToken ?? null, JSON.stringify(task), task.updatedAt, task.id);
    if (Number(result.changes) !== 1) throw new NotFoundError('Agent task not found');
  }

  async saveIf(task: AgentTask, expected: AgentTaskSaveExpectation): Promise<boolean> {
    const approvalClause = expected.executionApproval === undefined
      ? ''
      : ' AND execution_approval = ?';
    const leaseClause = expected.executionLeaseToken === undefined
      ? ''
      : expected.executionLeaseToken === null
        ? ' AND execution_lease_token IS NULL'
        : ' AND execution_lease_token = ?';
    const parameters = [
      task.status,
      task.executionApproval,
      task.executionLeaseToken ?? null,
      JSON.stringify(task),
      task.updatedAt,
      task.id,
      expected.status,
      ...(expected.executionApproval === undefined ? [] : [expected.executionApproval]),
      ...(expected.executionLeaseToken === undefined || expected.executionLeaseToken === null
        ? [] : [expected.executionLeaseToken]),
    ];
    const result = this.database.prepare(`
      UPDATE agent_tasks
      SET status = ?, execution_approval = ?, execution_lease_token = ?, payload_json = ?, updated_at = ?
      WHERE id = ? AND status = ?${approvalClause}${leaseClause}
    `).run(...parameters);
    return Number(result.changes) === 1;
  }
}
