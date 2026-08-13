import { randomUUID } from 'node:crypto';
import type {
  AgentArtifact,
  AgentSource,
  AgentTask,
  AgentTaskEvent,
  AgentTaskStep,
  GoaiAgentService,
} from '../domain/agent-task.js';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors.js';
import type { AgentTaskRepository } from '../repositories/agent-task-repository.js';
import {
  countUnicodeCharacters,
  executeGoaiTool,
  type GoaiToolContext,
  type GoaiToolName,
  type GoaiToolResult,
} from './goai-agent-tools.js';

export const GOAI_STEPS = [
  ['rules', '整理官方规则和证据', 'official_rules_snapshot', 'existing'],
  ['fit', '分析 LIVE IN HDU 与 AI+教育的匹配关系', 'goai_task_planner', 'prototype'],
  ['brief', '生成 500 字以内作品简介', 'submission_brief_generator', 'prototype'],
  ['validate', '校验并修订作品简介', 'submission_brief_validator', 'prototype'],
  ['checklist', '创建初赛任务清单', 'system_checklist_creator', 'prototype'],
  ['package', '整理可下载成果', 'artifact_packager', 'prototype'],
  ['submit', 'GOAI 官网最终提交', 'external_submission', 'roadmap'],
] as const;

type GoaiToolExecutor = (
  name: GoaiToolName,
  context: GoaiToolContext,
) => Promise<GoaiToolResult>;

const ALLOWED_GOALS = [/GOAI/i, /无界应用/, /初赛/];
const DEADLINE = '2026-08-16T23:59:59+08:00';
const UNKNOWN_TOOL_ERROR = '工具执行失败，请重试或转人工处理';
const EXECUTION_LEASE_MS = 5 * 60_000;

function assertSupportedGoal(goal: string): string {
  const normalized = goal.trim();
  if (normalized.length === 0) {
    throw new ValidationError('goal must be a non-blank string');
  }
  if (!ALLOWED_GOALS.some((pattern) => pattern.test(normalized))) {
    throw new ValidationError('The initial prototype supports only GOAI initial submission preparation');
  }
  return normalized;
}

function event(
  type: AgentTaskEvent['type'],
  stepId: string | null,
  summary: string,
  occurredAt: string,
  metadata: AgentTaskEvent['metadata'] = {},
): AgentTaskEvent {
  return { id: randomUUID(), type, stepId, occurredAt, summary, metadata };
}

function touch(task: AgentTask, now: string): AgentTask {
  task.updatedAt = now;
  task.progress = {
    completed: task.steps.filter((step) => step.status === 'completed').length,
    total: task.steps.length,
  };
  return task;
}

function mergeArtifacts(current: AgentArtifact[], incoming: AgentArtifact[]): AgentArtifact[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()];
}

function mergeSources(current: AgentSource[], incoming: AgentSource[]): AgentSource[] {
  const byKey = new Map(current.map((item) => [`${item.title}|${item.url}`, item]));
  for (const item of incoming) byKey.set(`${item.title}|${item.url}`, item);
  return [...byKey.values()];
}

function plannedSteps(): AgentTaskStep[] {
  return GOAI_STEPS.map(([id, title, toolName, evidenceLevel]) => ({
    id,
    title,
    toolName,
    status: 'pending',
    evidenceLevel,
    startedAt: null,
    completedAt: null,
    resultSummary: null,
    error: null,
  }));
}

function sanitizedToolError(): Error {
  return new Error(UNKNOWN_TOOL_ERROR);
}

function sanitizedErrorType(error: unknown): string {
  if (error instanceof ValidationError) return 'ValidationError';
  if (error instanceof Error) return 'Error';
  return 'UnknownError';
}

function hasArtifact(
  result: GoaiToolResult,
  id: string,
  kind: AgentArtifact['kind'],
  characterCount?: number,
): boolean {
  return result.artifacts.some((artifact) => (
    artifact.id === id
    && artifact.kind === kind
    && (characterCount === undefined || (
      artifact.characterCount === characterCount
      && countUnicodeCharacters(artifact.content) === characterCount
    ))
  ));
}

function assertToolResultContract(
  step: AgentTaskStep,
  result: GoaiToolResult,
  task: AgentTask,
): void {
  let fulfilled = false;
  switch (step.id) {
    case 'rules':
      fulfilled = hasArtifact(result, 'goai-rules', 'rules') && result.sources.length >= 2;
      break;
    case 'fit':
      fulfilled = hasArtifact(result, 'goai-plan', 'outline');
      break;
    case 'brief':
      fulfilled = hasArtifact(result, 'goai-brief-draft', 'brief', 537);
      break;
    case 'validate': {
      const draft = task.artifacts.find((artifact) => artifact.id === 'goai-brief-draft');
      fulfilled = draft?.kind === 'brief'
        && draft.characterCount === 537
        && hasArtifact(result, draft.id, 'brief', 492)
        && result.metadata.valid === true
        && result.metadata.initialCharacterCount === 537
        && result.metadata.finalCharacterCount === 492;
      break;
    }
    case 'checklist':
      fulfilled = hasArtifact(result, 'goai-checklist', 'checklist');
      break;
    case 'package':
      fulfilled = hasArtifact(result, 'goai-package', 'compliance')
        && result.metadata.packageReady === true
        && result.metadata.missingArtifacts === null
        && result.metadata.readinessScope === 'demo_artifact_manifest';
      break;
  }
  if (!fulfilled) throw new Error('GOAI tool result contract was not fulfilled');
}

export class GoaiAgentOrchestrator implements GoaiAgentService {
  private readonly taskLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly repository: AgentTaskRepository,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly toolExecutor: GoaiToolExecutor = executeGoaiTool,
  ) {}

  async createTask(goal: string): Promise<AgentTask> {
    const normalizedGoal = assertSupportedGoal(goal);
    const createdAt = this.now();
    const task: AgentTask = {
      id: `task-goai-${randomUUID()}`,
      scenario: 'goai_initial_submission',
      goal: normalizedGoal,
      deadline: DEADLINE,
      status: 'created',
      progress: { completed: 0, total: 0 },
      steps: [],
      events: [],
      artifacts: [],
      sources: [],
      executionApproval: 'required',
      executionStartedAt: null,
      executionLeaseToken: null,
      externalSubmissionApproval: 'required',
      externalSubmissionStatus: 'awaiting_user_confirmation',
      createdAt,
      updatedAt: createdAt,
    };
    await this.repository.create(task);

    task.status = 'planning';
    task.events.push(event('status', null, '正在规划 GOAI 初赛准备任务', this.now(), { status: 'planning' }));
    task.steps = plannedSteps();
    task.status = 'awaiting_confirmation';
    task.events.push(event(
      'approval_required',
      null,
      '计划已生成，等待用户确认执行',
      this.now(),
      { approval: 'execution', status: 'required' },
    ));
    await this.repository.save(touch(task, this.now()));
    return task;
  }

  async getTask(id: string): Promise<AgentTask> {
    const task = await this.repository.getById(id);
    if (!task) throw new NotFoundError('Agent task not found');
    return task;
  }

  async confirmExecution(id: string): Promise<AgentTask> {
    return this.withTaskLock(id, async () => {
      const task = await this.getTask(id);
      if (task.status !== 'awaiting_confirmation' || task.executionApproval !== 'required') {
        throw new ConflictError('Agent task execution cannot be confirmed in its current state');
      }
      task.executionApproval = 'approved';
      const claimed = await this.repository.saveIf(touch(task, this.now()), {
        status: 'awaiting_confirmation',
        executionApproval: 'required',
      });
      if (!claimed) {
        await this.getTask(id);
        throw new ConflictError('Agent task execution cannot be confirmed in its current state');
      }
      return task;
    });
  }

  async run(id: string): Promise<AgentTask> {
    return this.withTaskLock(id, async () => {
      const task = await this.getTask(id);
      if (task.status !== 'awaiting_confirmation' || task.executionApproval !== 'approved') {
        throw new ConflictError('Agent task is not ready to run');
      }

      task.status = 'running';
      task.executionStartedAt = this.now();
      const leaseToken = randomUUID();
      task.executionLeaseToken = leaseToken;
      task.events.push(event('status', null, '已开始执行 GOAI 初赛准备任务', this.now(), { status: 'running' }));
      const claimed = await this.repository.saveIf(touch(task, this.now()), {
        status: 'awaiting_confirmation',
        executionApproval: 'approved',
        executionLeaseToken: null,
      });
      if (!claimed) {
        await this.getTask(id);
        throw new ConflictError('Agent task is not ready to run');
      }

      return this.executeClaimed(task, leaseToken);
    });
  }

  async retry(id: string): Promise<AgentTask> {
    return this.withTaskLock(id, async () => {
      const task = await this.getTask(id);
      const now = this.now();
      const staleRunning = task.status === 'running'
        && typeof task.executionStartedAt === 'string'
        && Date.parse(now) - Date.parse(task.executionStartedAt) >= EXECUTION_LEASE_MS;
      if ((task.status !== 'failed' && !staleRunning) || task.executionApproval !== 'approved') {
        throw new ConflictError('Agent task is not eligible for retry');
      }
      task.events.push(event(
        staleRunning ? 'takeover_requested' : 'retry_requested',
        null,
        staleRunning ? '运行租约已过期，用户请求接管任务' : '用户请求重试失败任务',
        now,
        {},
      ));
      task.status = 'retrying';
      task.events.push(event('retrying', null, '正在从安全检查点重试未完成步骤', this.now(), {}));
      const previousLease = task.executionLeaseToken ?? null;
      const leaseToken = randomUUID();
      task.executionLeaseToken = leaseToken;
      task.status = 'running';
      task.executionStartedAt = now;
      const claimed = await this.repository.saveIf(touch(task, now), {
        status: staleRunning ? 'running' : 'failed', executionApproval: 'approved', executionLeaseToken: previousLease,
      });
      if (!claimed) throw new ConflictError('Agent task is not eligible for retry');
      return this.executeClaimed(task, leaseToken);
    });
  }

  async getArtifact(taskId: string, artifactId: string): Promise<AgentArtifact> {
    const task = await this.getTask(taskId);
    const artifact = task.artifacts.find((item) => item.id === artifactId);
    if (!artifact) throw new NotFoundError('Agent artifact not found');
    return artifact;
  }

  private async executeClaimed(task: AgentTask, leaseToken: string): Promise<AgentTask> {
    for (const step of task.steps.slice(0, 6)) {
      if (step.status === 'completed') continue;
      if (step.status === 'failed') { step.status = 'pending'; step.error = null; step.startedAt = null; step.completedAt = null; step.resultSummary = null; }
      await this.runToolStep(task, step, leaseToken);
    }
    const submissionStep = task.steps[6];
    if (!submissionStep) throw new ConflictError('Agent task plan is incomplete');
    submissionStep.status = 'blocked'; submissionStep.resultSummary = '等待用户在 GOAI 官网确认并提交';
    task.status = 'completed'; task.executionStartedAt = null; task.executionLeaseToken = null;
    task.events.push(event('approval_required', submissionStep.id, submissionStep.resultSummary, this.now(), { approval: 'external_submission', status: 'required' }));
    task.events.push(event('status', null, 'GOAI 初赛准备任务已完成', this.now(), { status: 'completed' }));
    await this.saveLease(task, leaseToken);
    return task;
  }

  private async saveLease(task: AgentTask, leaseToken: string): Promise<void> {
    const expectedStatus = task.status === 'completed' ? 'running' : task.status;
    const claimed = await this.repository.saveIf(touch(task, this.now()), { status: expectedStatus, executionApproval: 'approved', executionLeaseToken: leaseToken });
    if (!claimed) throw new ConflictError('Agent task execution lease was lost');
  }

  private async runToolStep(task: AgentTask, step: AgentTaskStep, leaseToken: string): Promise<void> {
    step.status = 'running';
    step.startedAt = this.now();
    task.events.push(event(
      'tool_started',
      step.id,
      `正在执行：${step.title}`,
      this.now(),
      { tool: step.toolName },
    ));
    await this.saveLease(task, leaseToken);

    try {
      if (step.id === 'validate') {
        task.events.push(event(
          'validation_failed',
          step.id,
          '作品简介初稿超过 500 Unicode 字符限制',
          this.now(),
          { characterCount: 537, limit: 500 },
        ));
        await this.saveLease(task, leaseToken);
      }

      const result = await this.toolExecutor(step.toolName as GoaiToolName, {
        task,
        now: this.now,
      });
      assertToolResultContract(step, result, task);
      task.artifacts = mergeArtifacts(task.artifacts, result.artifacts);
      task.sources = mergeSources(task.sources, result.sources);

      if (step.id === 'validate') {
        task.events.push(event(
          'validation_passed',
          step.id,
          '作品简介已修订为 492 Unicode 字符并通过限制',
          this.now(),
          { characterCount: 492, limit: 500 },
        ));
      }
      for (const artifact of result.artifacts) {
        task.events.push(event(
          'artifact_created',
          step.id,
          `已生成成果：${artifact.filename}`,
          this.now(),
          { artifactId: artifact.id, kind: artifact.kind, characterCount: artifact.characterCount },
        ));
      }
      step.status = 'completed';
      step.completedAt = this.now();
      step.resultSummary = result.summary;
      task.events.push(event('tool_completed', step.id, result.summary, this.now(), result.metadata));
      await this.saveLease(task, leaseToken);
    } catch (error) {
      const exposedError = sanitizedToolError();
      step.status = 'failed';
      step.error = exposedError.message;
      task.status = 'failed';
      task.executionStartedAt = null;
      task.events.push(event(
        'status',
        step.id,
        exposedError.message,
        this.now(),
        { status: 'failed', errorType: sanitizedErrorType(error) },
      ));
      const saved = await this.repository.saveIf(touch(task, this.now()), { status: 'running', executionApproval: 'approved', executionLeaseToken: leaseToken });
      if (!saved) throw new ConflictError('Agent task execution lease was lost');
      throw exposedError;
    }
  }

  private async withTaskLock<T>(id: string, action: () => Promise<T>): Promise<T> {
    const previous = this.taskLocks.get(id) ?? Promise.resolve();
    let release = (): void => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.taskLocks.set(id, current);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.taskLocks.get(id) === current) this.taskLocks.delete(id);
    }
  }
}
