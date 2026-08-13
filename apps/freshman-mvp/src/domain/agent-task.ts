export type AgentEvidenceLevel = 'existing' | 'prototype' | 'roadmap';
export type AgentTaskStatus =
  | 'created'
  | 'planning'
  | 'awaiting_confirmation'
  | 'running'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'needs_human';
export type AgentStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
export type AgentApprovalStatus = 'not_required' | 'required' | 'approved' | 'rejected';

export interface AgentTaskStep {
  id: string;
  title: string;
  toolName: string;
  status: AgentStepStatus;
  evidenceLevel: AgentEvidenceLevel;
  startedAt: string | null;
  completedAt: string | null;
  resultSummary: string | null;
  error: string | null;
}

export interface AgentTaskEvent {
  id: string;
  type: 'status' | 'tool_started' | 'tool_completed' | 'validation_failed'
    | 'validation_passed' | 'approval_required' | 'artifact_created' | 'retry_requested' | 'retrying'
    | 'takeover_requested';
  stepId: string | null;
  occurredAt: string;
  summary: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface AgentArtifact {
  id: string;
  kind: 'rules' | 'brief' | 'outline' | 'compliance' | 'checklist';
  filename: string;
  mimeType: 'text/plain; charset=utf-8' | 'text/markdown; charset=utf-8';
  content: string;
  characterCount: number | null;
  validatedAt: string | null;
}

export interface AgentSource {
  title: string;
  url: string;
  capturedAt: string;
  level: AgentEvidenceLevel;
}

export interface AgentTask {
  id: string;
  scenario: 'goai_initial_submission';
  goal: string;
  deadline: string;
  status: AgentTaskStatus;
  progress: { completed: number; total: number };
  steps: AgentTaskStep[];
  events: AgentTaskEvent[];
  artifacts: AgentArtifact[];
  sources: AgentSource[];
  executionApproval: AgentApprovalStatus;
  executionStartedAt?: string | null;
  executionLeaseToken?: string | null;
  externalSubmissionApproval: 'required';
  externalSubmissionStatus: 'awaiting_user_confirmation';
  createdAt: string;
  updatedAt: string;
}

export interface GoaiAgentService {
  createTask(goal: string): Promise<AgentTask>;
  getTask(id: string): Promise<AgentTask>;
  confirmExecution(id: string): Promise<AgentTask>;
  run(id: string): Promise<AgentTask>;
  retry(id: string): Promise<AgentTask>;
  getArtifact(taskId: string, artifactId: string): Promise<AgentArtifact>;
}
