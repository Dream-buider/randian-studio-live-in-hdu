<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  agentArtifactUrl,
  confirmAgentTask,
  createAgentTask,
  getAgentTask,
  retryAgentTask,
  runAgentTask,
  safeHttpUrl,
  type AgentEvidenceLevel,
  type AgentTask,
  type AgentTaskEvent,
  type AgentTaskStatus,
  type AgentStepStatus,
} from '../api.js';

const DEFAULT_GOAL = '我想参加 GOAI，帮我把初赛准备好';
const REPLAY_INTERVAL_MS = 160;

const route = useRoute();
const router = useRouter();
const goal = ref(DEFAULT_GOAL);
const task = ref<AgentTask | null>(null);
const busy = ref(false);
const errorMessage = ref('');
const loadError = ref(false);
const executionErrorTaskId = ref('');
const replayMode = ref(false);
const replayCount = ref(0);
const persistedTaskId = ref('');
const persistedReplay = ref(false);
let replayTimer: ReturnType<typeof setInterval> | null = null;
let operationGeneration = 0;
let disposed = false;

const title = computed(() => task.value?.scenario === 'goai_initial_submission'
  ? 'GOAI 无界应用赛道初赛准备'
  : '初赛准备任务');
const sortedEvents = computed(() => [...(task.value?.events ?? [])].sort((left, right) => (
  left.occurredAt.localeCompare(right.occurredAt)
)));
const visibleEvents = computed(() => replayMode.value
  ? sortedEvents.value.slice(0, replayCount.value)
  : sortedEvents.value);
const validationFailed = computed(() => visibleEvents.value.find((event) => (
  event.type === 'validation_failed'
)) ?? null);
const validationPassed = computed(() => visibleEvents.value.find((event) => (
  event.type === 'validation_passed'
)) ?? null);
const executionRetry = computed(() => Boolean(
  task.value && executionErrorTaskId.value === task.value.id && !loadError.value,
));
const actionLabel = computed(() => task.value?.status === 'failed' || executionRetry.value
  ? '重试确认并执行任务'
  : '确认并执行任务');

function evidenceLabel(level: AgentEvidenceLevel): string {
  return {
    existing: '现有证据',
    prototype: '初赛原型',
    roadmap: '复赛路线',
  }[level];
}

function taskStatusLabel(status: AgentTaskStatus): string {
  return {
    created: '已创建',
    planning: '规划中',
    awaiting_confirmation: '等待执行确认',
    running: '执行中',
    verifying: '验证中',
    completed: '初赛准备已完成',
    failed: '执行失败',
    retrying: '重试中',
    needs_human: '需要人工处理',
  }[status];
}

function stepStatusLabel(status: AgentStepStatus): string {
  return {
    pending: '待执行',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    blocked: '等待确认',
  }[status];
}

function artifactKindLabel(kind: AgentTask['artifacts'][number]['kind']): string {
  return {
    rules: '规则快照',
    brief: '作品简介',
    outline: '方案大纲',
    compliance: '合规说明',
    checklist: '任务清单',
  }[kind];
}

function metadataCount(event: AgentTaskEvent): string | number {
  return typeof event.metadata.characterCount === 'number'
    ? event.metadata.characterCount
    : '—';
}

function displayDate(value: string): string {
  return value.slice(0, 10).replaceAll('-', '.');
}

function displayTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? value
    : new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: 'Asia/Shanghai',
    }).format(parsed);
}

function localEvidence(url: string): boolean {
  return url.startsWith('local-evidence://');
}

function resetError(): void {
  errorMessage.value = '';
}

function setSafeError(): void {
  errorMessage.value = '任务暂时无法读取或执行，请重试。';
}

function claimOperation(): number {
  operationGeneration += 1;
  return operationGeneration;
}

function ownsOperation(generation: number): boolean {
  return !disposed && generation === operationGeneration;
}

function clearReplayTimer(): void {
  if (replayTimer !== null) {
    clearInterval(replayTimer);
    replayTimer = null;
  }
}

function beginReplay(): void {
  clearReplayTimer();
  const count = sortedEvents.value.length;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    replayCount.value = count;
    return;
  }
  replayCount.value = 0;
  if (count === 0) return;
  replayTimer = setInterval(() => {
    replayCount.value = Math.min(replayCount.value + 1, count);
    if (replayCount.value >= count) clearReplayTimer();
  }, REPLAY_INTERVAL_MS);
}

async function createTask(): Promise<void> {
  if (!goal.value.trim() || busy.value) return;
  const generation = claimOperation();
  clearReplayTimer();
  busy.value = true;
  resetError();
  loadError.value = false;
  executionErrorTaskId.value = '';
  try {
    const result = await createAgentTask(goal.value);
    if (!ownsOperation(generation)) return;
    task.value = result;
    await router.replace({ query: { ...route.query, task: result.id } });
  } catch {
    if (!ownsOperation(generation)) return;
    setSafeError();
  } finally {
    if (ownsOperation(generation)) busy.value = false;
  }
}

async function approveAndRun(): Promise<void> {
  if (!task.value || busy.value || replayMode.value || loadError.value) return;
  const generation = claimOperation();
  let currentTask = task.value;
  clearReplayTimer();
  busy.value = true;
  resetError();
  loadError.value = false;
  executionErrorTaskId.value = '';
  try {
    if (currentTask.executionApproval !== 'approved') {
      const confirmed = await confirmAgentTask(currentTask.id);
      if (!ownsOperation(generation)) return;
      currentTask = confirmed;
      task.value = confirmed;
    }
    const result = currentTask.status === 'failed'
      ? await retryAgentTask(currentTask.id)
      : await runAgentTask(currentTask.id);
    if (!ownsOperation(generation)) return;
    task.value = result;
  } catch {
    if (!ownsOperation(generation)) return;
    try {
      const refreshed = await getAgentTask(currentTask.id);
      if (ownsOperation(generation) && refreshed && refreshed.id === currentTask.id) {
        task.value = refreshed;
      }
    } catch {
      // Preserve the last trusted server task when the failure state cannot be reloaded.
    }
    setSafeError();
    executionErrorTaskId.value = currentTask.id;
  } finally {
    if (ownsOperation(generation)) busy.value = false;
  }
}

async function loadPersistedTask(id: string, replay: boolean): Promise<void> {
  const generation = claimOperation();
  const retryingSameLoad = loadError.value && persistedTaskId.value === id;
  executionErrorTaskId.value = '';
  persistedTaskId.value = id;
  persistedReplay.value = replay;
  replayMode.value = replay;
  clearReplayTimer();
  replayCount.value = 0;
  busy.value = true;
  if (!retryingSameLoad) {
    resetError();
    loadError.value = false;
  }
  try {
    const result = await getAgentTask(id);
    if (!ownsOperation(generation)) return;
    task.value = result;
    resetError();
    loadError.value = false;
    executionErrorTaskId.value = '';
    if (replay) beginReplay();
  } catch {
    if (!ownsOperation(generation)) return;
    setSafeError();
    loadError.value = true;
  } finally {
    if (ownsOperation(generation)) busy.value = false;
  }
}

function routeTaskRequest(): { id: string; replay: boolean } {
  const queryValue = Array.isArray(route.query.task) ? route.query.task[0] : route.query.task;
  const taskId = typeof queryValue === 'string' ? queryValue.trim() : '';
  return { id: taskId, replay: route.query.replay === '1' && taskId.length > 0 };
}

function retryPersistedTask(): void {
  if (!persistedTaskId.value || busy.value) return;
  void loadPersistedTask(persistedTaskId.value, persistedReplay.value);
}

watch(
  () => [route.query.task, route.query.replay],
  () => {
    const request = routeTaskRequest();
    if (request.id) {
      if (task.value?.id === request.id && replayMode.value === request.replay) {
        persistedTaskId.value = request.id;
        persistedReplay.value = request.replay;
        return;
      }
      void loadPersistedTask(request.id, request.replay);
      return;
    }
    claimOperation();
    clearReplayTimer();
    task.value = null;
    busy.value = false;
    resetError();
    persistedTaskId.value = '';
    persistedReplay.value = false;
    replayMode.value = false;
    loadError.value = false;
    executionErrorTaskId.value = '';
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  disposed = true;
  operationGeneration += 1;
  clearReplayTimer();
});
</script>

<template>
  <main class="agent-workspace">
    <header class="agent-intro">
      <div>
        <p class="agent-kicker">LIVE IN HDU / AGENT WORKSPACE</p>
        <h1>把一个目标，拆成可核对的执行记录。</h1>
      </div>
      <p>围绕 GOAI 初赛准备生成计划、证据与成果；最终官网提交仍由你确认。</p>
    </header>

    <form
      data-agent="goal-form"
      class="goal-form"
      aria-label="GOAI 初赛目标"
      @submit.prevent="createTask"
    >
      <label for="agent-goal">任务目标</label>
      <div class="goal-control">
        <textarea
          id="agent-goal"
          v-model="goal"
          data-agent="goal-input"
          rows="2"
          maxlength="500"
          :disabled="busy || replayMode"
        />
        <button
          type="submit"
          aria-label="创建 GOAI 初赛准备任务"
          :disabled="busy || replayMode || !goal.trim()"
        >
          {{ busy && !task ? '正在创建…' : '建立任务' }}
        </button>
      </div>
    </form>

    <div v-if="errorMessage" class="agent-error" role="alert">
      <p>{{ errorMessage }}</p>
      <button
        v-if="loadError && persistedTaskId"
        type="button"
        data-agent="retry-load"
        aria-label="重试读取任务"
        :disabled="busy"
        @click="retryPersistedTask"
      >
        {{ busy ? '正在重试…' : '重试读取' }}
      </button>
    </div>

    <template v-if="task">
      <section data-agent="task-header" class="task-header" aria-labelledby="agent-task-title">
        <div>
          <p v-if="replayMode" class="replay-label">演示回放：真实执行记录</p>
          <p class="task-id">TASK / {{ task.id }}</p>
          <h2 id="agent-task-title">{{ title }}</h2>
          <p class="task-goal">{{ task.goal }}</p>
        </div>
        <dl class="task-metrics">
          <div>
            <dt>截止日期</dt>
            <dd>{{ displayDate(task.deadline) }}</dd>
          </div>
          <div>
            <dt>进度</dt>
            <dd>{{ task.progress.completed }} / {{ task.progress.total }}</dd>
          </div>
        </dl>
        <div class="progress-block">
          <div
            class="progress-track"
            role="progressbar"
            aria-label="GOAI 初赛准备进度"
            :aria-valuenow="task.progress.completed"
            :aria-valuemax="task.progress.total"
            aria-valuemin="0"
          >
            <span :style="{ width: `${task.progress.total ? task.progress.completed / task.progress.total * 100 : 0}%` }" />
          </div>
          <p aria-live="polite">{{ taskStatusLabel(task.status) }}</p>
        </div>
      </section>

      <section
        v-if="task.executionApproval === 'required' || task.executionApproval === 'approved'"
        data-agent="approval-gate"
        class="approval-gate"
      >
        <div>
          <span class="gate-index">01 / EXECUTION GATE</span>
          <h2>{{ task.executionApproval === 'approved' ? '已确认执行' : '等待执行确认' }}</h2>
          <p>先确认 {{ task.steps.length }} 步任务计划，再开始执行；界面仅呈现服务端返回的状态。</p>
        </div>
        <button
          v-if="task.status !== 'completed'"
          type="button"
          data-agent="run-task"
          :aria-label="actionLabel"
          :disabled="busy || replayMode || loadError"
          @click="approveAndRun"
        >
          {{ busy ? '执行中…' : executionRetry ? '重试执行' : '确认并执行' }}
        </button>
      </section>

      <div class="workspace-grid">
        <section class="workspace-panel plan-panel" aria-labelledby="agent-plan-title">
          <header class="panel-heading">
            <div>
              <p>PLAN / {{ task.steps.length }} STEPS</p>
              <h2 id="agent-plan-title">执行计划</h2>
            </div>
            <span>{{ task.progress.completed }} 已完成</span>
          </header>
          <ol data-agent="step-list" class="step-list">
            <li v-for="(step, index) in task.steps" :key="step.id" :data-status="step.status">
              <span class="step-number">{{ String(index + 1).padStart(2, '0') }}</span>
              <div>
                <h3>{{ step.title }}</h3>
                <p>{{ step.resultSummary || step.toolName }}</p>
              </div>
              <div class="step-meta">
                <span :data-evidence="step.evidenceLevel">{{ evidenceLabel(step.evidenceLevel) }}</span>
                <strong>{{ stepStatusLabel(step.status) }}</strong>
              </div>
            </li>
          </ol>
        </section>

        <section class="workspace-panel timeline-panel" aria-labelledby="agent-events-title">
          <header class="panel-heading">
            <div>
              <p>EXECUTION LOG</p>
              <h2 id="agent-events-title">执行时间线</h2>
            </div>
            <span>{{ visibleEvents.length }} / {{ sortedEvents.length }}</span>
          </header>
          <ol data-agent="event-timeline" class="event-timeline" aria-live="polite">
            <li v-for="event in visibleEvents" :key="event.id" :data-event-type="event.type">
              <time :datetime="event.occurredAt">{{ displayTime(event.occurredAt) }}</time>
              <span class="event-node" aria-hidden="true" />
              <p>
                {{ event.summary }}
                <strong v-if="event.type === 'validation_failed' || event.type === 'validation_passed'">
                  · {{ metadataCount(event) }}
                </strong>
              </p>
            </li>
          </ol>
        </section>

        <section class="workspace-panel artifact-panel" aria-labelledby="agent-artifacts-title">
          <header class="panel-heading">
            <div>
              <p>OUTPUTS</p>
              <h2 id="agent-artifacts-title">成果文件</h2>
            </div>
            <span>{{ task.artifacts.length }} 份</span>
          </header>
          <ul data-agent="artifact-list" class="artifact-list">
            <li v-for="artifact in task.artifacts" :key="artifact.id">
              <div>
                <span class="file-kind">{{ artifactKindLabel(artifact.kind) }}</span>
                <strong>{{ artifact.filename }}</strong>
                <small>{{ artifact.validatedAt ? '已验证' : '待验证' }}</small>
              </div>
              <a
                :href="agentArtifactUrl(task.id, artifact.id)"
                :download="artifact.filename"
                :aria-label="`下载 ${artifact.filename}`"
              >下载</a>
            </li>
          </ul>
          <p v-if="task.artifacts.length === 0" class="empty-state">执行后在此归档可下载成果。</p>
        </section>

        <section class="workspace-panel source-panel" aria-labelledby="agent-sources-title">
          <header class="panel-heading">
            <div>
              <p>EVIDENCE</p>
              <h2 id="agent-sources-title">来源与证据</h2>
            </div>
            <span>{{ task.sources.length }} 条</span>
          </header>
          <ul data-agent="source-list" class="source-list">
            <li v-for="source in task.sources" :key="`${source.url}:${source.title}`">
              <div>
                <a
                  v-if="safeHttpUrl(source.url)"
                  :href="safeHttpUrl(source.url) ?? undefined"
                  target="_blank"
                  rel="noopener noreferrer"
                >{{ source.title }}</a>
                <strong v-else-if="localEvidence(source.url)">本地证据：{{ source.title }}</strong>
                <strong v-else>来源不可打开</strong>
                <small>抓取日期 {{ source.capturedAt }}</small>
              </div>
              <span :data-evidence="source.level">{{ evidenceLabel(source.level) }}</span>
            </li>
          </ul>
          <p v-if="task.sources.length === 0" class="empty-state">官方来源将随执行结果入档。</p>
        </section>
      </div>

      <section v-if="validationFailed || validationPassed" class="validation-strip" aria-label="字数验证结果">
        <article v-if="validationFailed" data-agent="validation-failed" aria-live="polite">
          <span>VALIDATION / REVISED</span>
          <strong>{{ metadataCount(validationFailed) }}</strong>
          <p>{{ validationFailed.summary }}</p>
        </article>
        <article v-if="validationPassed" data-agent="validation-passed" aria-live="polite">
          <span>VALIDATION / PASSED</span>
          <strong>{{ metadataCount(validationPassed) }}</strong>
          <p>{{ validationPassed.summary }}</p>
        </article>
      </section>

      <section data-agent="submission-gate" class="submission-gate">
        <div>
          <span class="gate-index">{{ String(task.steps.length).padStart(2, '0') }} / EXTERNAL ACTION</span>
          <h2>等待用户确认</h2>
          <p>GOAI 官网最终提交不会自动进行。请人工核对成果后完成对外操作。</p>
        </div>
        <span class="submission-state">未提交</span>
      </section>
    </template>
  </main>
</template>

<style scoped>
.agent-workspace {
  --agent-bg: #111315;
  --agent-panel: #191c1f;
  --agent-panel-soft: #202428;
  --agent-line: rgb(255 255 255 / 10%);
  --agent-text: #f3f0e9;
  --agent-muted: #9da5aa;
  --agent-coral: #ff725c;
  --agent-cyan: #42d9e8;
  min-height: 100vh;
  overflow-x: hidden;
  padding: 32px clamp(18px, 3vw, 48px) 48px;
  color: var(--agent-text);
  background:
    radial-gradient(circle at 92% 4%, rgb(66 217 232 / 10%), transparent 25rem),
    radial-gradient(circle at 4% 18%, rgb(255 114 92 / 9%), transparent 28rem),
    var(--agent-bg);
  font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
}

.agent-intro,
.task-header,
.approval-gate,
.workspace-grid,
.validation-strip,
.submission-gate,
.goal-form,
.agent-error {
  width: min(100%, 1376px);
  margin-inline: auto;
}

.agent-intro {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr);
  align-items: end;
  gap: 32px;
  padding-bottom: 25px;
  border-bottom: 1px solid var(--agent-line);
}

.agent-kicker,
.task-id,
.panel-heading p,
.gate-index,
.validation-strip article > span {
  margin: 0 0 9px;
  color: var(--agent-cyan);
  font-size: 0.71rem;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.agent-intro h1,
.agent-intro p,
.task-header h2,
.task-header p,
.approval-gate h2,
.approval-gate p,
.panel-heading h2,
.event-timeline p,
.submission-gate h2,
.submission-gate p {
  margin: 0;
}

.agent-intro h1 {
  max-width: 760px;
  font-size: clamp(1.65rem, 3vw, 3rem);
  line-height: 1.08;
  letter-spacing: -0.04em;
}

.agent-intro > p {
  color: var(--agent-muted);
  line-height: 1.75;
}

.goal-form {
  margin-top: 18px;
  padding: 16px;
  border: 1px solid var(--agent-line);
  border-radius: 18px;
  background: rgb(25 28 31 / 88%);
}

.goal-form > label {
  display: block;
  margin: 0 0 8px 2px;
  color: var(--agent-muted);
  font-size: 0.78rem;
  font-weight: 750;
}

.goal-control {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
}

.goal-control textarea {
  min-width: 0;
  min-height: 56px;
  resize: vertical;
  padding: 14px 16px;
  border: 1px solid transparent;
  border-radius: 12px;
  color: var(--agent-text);
  background: #101214;
  font: inherit;
  line-height: 1.5;
}

button,
.artifact-list a {
  min-height: 44px;
  border: 0;
  border-radius: 11px;
  color: #121416;
  background: var(--agent-coral);
  font: inherit;
  font-weight: 800;
  cursor: pointer;
  transition: transform 160ms ease, filter 160ms ease, box-shadow 160ms ease;
}

.goal-control button {
  min-width: 132px;
  padding-inline: 20px;
}

button:hover:not(:disabled),
.artifact-list a:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

button:disabled {
  cursor: wait;
  opacity: 0.58;
}

button:focus-visible,
a:focus-visible,
textarea:focus-visible {
  outline: 3px solid var(--agent-cyan);
  outline-offset: 3px;
}

.agent-error {
  box-sizing: border-box;
  margin-top: 14px;
  padding: 13px 16px;
  border: 1px solid rgb(255 114 92 / 48%);
  border-radius: 12px;
  color: #ffd4ce;
  background: rgb(255 114 92 / 10%);
}

.agent-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.agent-error p {
  margin: 0;
}

.agent-error button {
  flex: 0 0 auto;
  min-height: 38px;
  padding-inline: 14px;
}

.task-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px 40px;
  margin-top: 18px;
  padding: 25px;
  border: 1px solid var(--agent-line);
  border-radius: 20px;
  background: linear-gradient(135deg, rgb(31 35 38 / 96%), rgb(20 23 25 / 96%));
}

.task-header h2 {
  font-size: clamp(1.4rem, 2vw, 2.15rem);
  letter-spacing: -0.025em;
}

.task-goal {
  margin-top: 8px !important;
  color: var(--agent-muted);
}

.replay-label {
  display: inline-flex;
  margin-bottom: 10px !important;
  padding: 5px 9px;
  border: 1px solid rgb(66 217 232 / 30%);
  border-radius: 999px;
  color: var(--agent-cyan);
  font-size: 0.76rem;
  font-weight: 750;
}

.task-metrics {
  display: flex;
  gap: 28px;
  margin: 0;
}

.task-metrics div {
  min-width: 92px;
}

.task-metrics dt {
  color: var(--agent-muted);
  font-size: 0.72rem;
}

.task-metrics dd {
  margin: 6px 0 0;
  font-size: 1.25rem;
  font-weight: 850;
}

.progress-block {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  gap: 16px;
}

.progress-track {
  overflow: hidden;
  flex: 1;
  height: 7px;
  border-radius: 999px;
  background: #0c0e0f;
}

.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--agent-coral), var(--agent-cyan));
  transition: width 260ms ease;
}

.progress-block p {
  min-width: 9rem;
  color: var(--agent-cyan);
  font-size: 0.82rem;
  font-weight: 750;
  text-align: right;
}

.approval-gate,
.submission-gate {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-top: 14px;
  padding: 19px 22px;
  border: 1px solid rgb(255 114 92 / 32%);
  border-radius: 17px;
  background: linear-gradient(90deg, rgb(255 114 92 / 12%), rgb(255 114 92 / 3%));
}

.approval-gate h2,
.submission-gate h2 {
  font-size: 1.05rem;
}

.approval-gate p,
.submission-gate p {
  margin-top: 5px;
  color: var(--agent-muted);
  font-size: 0.84rem;
}

.approval-gate button {
  flex: 0 0 auto;
  padding-inline: 20px;
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(320px, 0.88fr);
  gap: 14px;
  margin-top: 14px;
}

.workspace-panel {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--agent-line);
  border-radius: 17px;
  background: rgb(25 28 31 / 92%);
}

.panel-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--agent-line);
}

.panel-heading h2 {
  font-size: 1.08rem;
}

.panel-heading > span {
  color: var(--agent-muted);
  font-size: 0.76rem;
}

.step-list,
.event-timeline,
.artifact-list,
.source-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.step-list li {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 13px;
  padding: 11px 0;
  border-bottom: 1px solid var(--agent-line);
}

.step-list li:last-child,
.artifact-list li:last-child,
.source-list li:last-child {
  border-bottom: 0;
}

.step-number {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid var(--agent-line);
  border-radius: 50%;
  color: var(--agent-muted);
  font-size: 0.7rem;
  font-weight: 850;
}

.step-list [data-status="completed"] .step-number {
  border-color: var(--agent-cyan);
  color: #101416;
  background: var(--agent-cyan);
}

.step-list h3,
.step-list p {
  overflow: hidden;
  margin: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-list h3 {
  font-size: 0.88rem;
}

.step-list p {
  margin-top: 4px;
  color: var(--agent-muted);
  font-size: 0.72rem;
}

.step-meta {
  display: grid;
  justify-items: end;
  gap: 5px;
}

[data-evidence] {
  color: var(--agent-cyan);
  font-size: 0.68rem;
}

.step-meta strong {
  font-size: 0.71rem;
}

.event-timeline {
  padding-top: 6px;
}

.event-timeline li {
  display: grid;
  grid-template-columns: 76px 14px minmax(0, 1fr);
  gap: 10px;
  min-height: 42px;
  padding-top: 11px;
  color: var(--agent-muted);
  font-size: 0.76rem;
}

.event-timeline time {
  font-variant-numeric: tabular-nums;
}

.event-node {
  position: relative;
  width: 7px;
  height: 7px;
  margin-top: 4px;
  border-radius: 50%;
  background: var(--agent-cyan);
  box-shadow: 0 0 0 4px rgb(66 217 232 / 10%);
}

.event-node::after {
  position: absolute;
  width: 1px;
  height: 34px;
  top: 10px;
  left: 3px;
  background: var(--agent-line);
  content: "";
}

.event-timeline li:last-child .event-node::after {
  display: none;
}

.event-timeline [data-event-type="validation_failed"] .event-node {
  background: var(--agent-coral);
}

.artifact-list li,
.source-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  padding: 13px 0;
  border-bottom: 1px solid var(--agent-line);
}

.artifact-list li > div,
.source-list li > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.artifact-list strong,
.source-list strong,
.source-list a {
  overflow-wrap: anywhere;
  color: var(--agent-text);
  font-size: 0.82rem;
}

.artifact-list small,
.source-list small,
.file-kind {
  color: var(--agent-muted);
  font-size: 0.69rem;
}

.file-kind {
  color: var(--agent-cyan);
}

.artifact-list a {
  display: inline-grid;
  flex: 0 0 auto;
  min-height: 36px;
  padding: 0 14px;
  place-items: center;
  font-size: 0.75rem;
  text-decoration: none;
}

.source-list a {
  text-decoration-color: rgb(66 217 232 / 58%);
  text-underline-offset: 3px;
}

.empty-state {
  margin: 18px 0 4px;
  color: var(--agent-muted);
  font-size: 0.78rem;
}

.validation-strip {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 14px;
}

.validation-strip article {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  padding: 17px 19px;
  border: 1px solid rgb(255 114 92 / 30%);
  border-radius: 17px;
  background: rgb(255 114 92 / 8%);
}

.validation-strip article[data-agent="validation-passed"] {
  border-color: rgb(66 217 232 / 30%);
  background: rgb(66 217 232 / 8%);
}

.validation-strip article > span {
  margin: 0;
  color: var(--agent-coral);
}

.validation-strip article[data-agent="validation-passed"] > span {
  color: var(--agent-cyan);
}

.validation-strip strong {
  grid-row: 1 / 3;
  grid-column: 2;
  font-size: 2rem;
}

.validation-strip p {
  margin: 5px 20px 0 0;
  color: var(--agent-muted);
  font-size: 0.78rem;
}

.submission-gate {
  border-color: rgb(66 217 232 / 26%);
  background: linear-gradient(90deg, rgb(66 217 232 / 10%), rgb(66 217 232 / 2%));
}

.submission-state {
  flex: 0 0 auto;
  padding: 7px 11px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 999px;
  color: var(--agent-muted);
  font-size: 0.72rem;
  font-weight: 750;
}

@media (min-width: 1200px) {
  .agent-workspace {
    padding-top: 24px;
  }

  .agent-intro h1 {
    font-size: 2.3rem;
  }

  .workspace-grid {
    grid-template-columns: repeat(12, minmax(0, 1fr));
  }

  .plan-panel {
    grid-column: span 5;
    grid-row: span 2;
  }

  .timeline-panel {
    grid-column: span 4;
    grid-row: span 2;
  }

  .artifact-panel,
  .source-panel {
    grid-column: span 3;
  }

  .plan-panel,
  .timeline-panel {
    min-height: 365px;
  }
}

@media (max-width: 900px) {
  .agent-intro,
  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .agent-intro {
    align-items: start;
    gap: 14px;
  }
}

@media (max-width: 640px) {
  .agent-workspace {
    padding: 20px 14px 32px;
  }

  .goal-control,
  .task-header,
  .validation-strip {
    grid-template-columns: 1fr;
  }

  .goal-control button,
  .approval-gate button {
    width: 100%;
  }

  .task-header {
    padding: 19px;
  }

  .task-metrics {
    justify-content: space-between;
  }

  .progress-block {
    grid-column: auto;
    align-items: flex-start;
    flex-direction: column;
  }

  .progress-track {
    width: 100%;
    flex: none;
  }

  .progress-block p {
    min-width: 0;
    text-align: left;
  }

  .approval-gate,
  .submission-gate,
  .agent-error {
    align-items: stretch;
    flex-direction: column;
  }

  .workspace-panel {
    padding: 17px;
  }

  .step-list li {
    grid-template-columns: 32px minmax(0, 1fr);
  }

  .step-meta {
    display: flex;
    grid-column: 2;
    justify-content: space-between;
  }

  .event-timeline li {
    grid-template-columns: 62px 12px minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .agent-workspace *,
  .agent-workspace *::before,
  .agent-workspace *::after {
    scroll-behavior: auto !important;
    animation: none !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
