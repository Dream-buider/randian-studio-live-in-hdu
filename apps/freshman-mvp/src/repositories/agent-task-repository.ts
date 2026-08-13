import type { AgentApprovalStatus, AgentTask, AgentTaskStatus } from '../domain/agent-task.js';

export interface AgentTaskSaveExpectation {
  status: AgentTaskStatus;
  executionApproval?: AgentApprovalStatus;
  executionLeaseToken?: string | null;
}

export interface AgentTaskRepository {
  create(task: AgentTask): Promise<void>;
  getById(id: string): Promise<AgentTask | null>;
  save(task: AgentTask): Promise<void>;
  saveIf(task: AgentTask, expected: AgentTaskSaveExpectation): Promise<boolean>;
}
