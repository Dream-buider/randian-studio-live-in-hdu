<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

// ==================== 静态演示数据 ====================
const DEFAULT_GOAL = '我想参加 GOAI，帮我把初赛准备好';
const REPLAY_INTERVAL_MS = 180;

const DEMO_TASK: any = {
  id: 'demo-task-goai-20260813',
  scenario: 'goai_initial_submission' as const,
  goal: DEFAULT_GOAL,
  deadline: '2026-08-16',
  status: 'awaiting_confirmation' as const,
  progress: { completed: 0, total: 7 },
  executionApproval: 'required' as const,
  externalSubmissionApproval: 'required' as const,
  externalSubmissionStatus: 'awaiting_user_confirmation' as const,
  steps: [
    { id: 'rules', title: '整理官方规则和证据', toolName: 'official_rules_snapshot', status: 'pending' as const, evidenceLevel: 'existing' as const, startedAt: null, completedAt: null, resultSummary: null, error: null },
    { id: 'fit', title: '分析 LIVE IN HDU 与 AI+教育的匹配关系', toolName: 'goai_task_planner', status: 'pending' as const, evidenceLevel: 'prototype' as const, startedAt: null, completedAt: null, resultSummary: null, error: null },
    { id: 'brief', title: '生成 500 字以内作品简介', toolName: 'submission_brief_generator', status: 'pending' as const, evidenceLevel: 'prototype' as const, startedAt: null, completedAt: null, resultSummary: null, error: null },
    { id: 'validate', title: '校验并修订作品简介', toolName: 'submission_brief_validator', status: 'pending' as const, evidenceLevel: 'prototype' as const, startedAt: null, completedAt: null, resultSummary: null, error: null },
    { id: 'checklist', title: '创建初赛任务清单', toolName: 'system_checklist_creator', status: 'pending' as const, evidenceLevel: 'prototype' as const, startedAt: null, completedAt: null, resultSummary: null, error: null },
    { id: 'package', title: '整理可下载成果', toolName: 'artifact_packager', status: 'pending' as const, evidenceLevel: 'prototype' as const, startedAt: null, completedAt: null, resultSummary: null, error: null },
    { id: 'submit', title: 'GOAI 官网最终提交', toolName: 'external_submission', status: 'pending' as const, evidenceLevel: 'roadmap' as const, startedAt: null, completedAt: null, resultSummary: null, error: null },
  ],
  events: [
    { id: 'e1', type: 'status', stepId: null, occurredAt: '2026-08-13T21:30:00+08:00', summary: '正在规划 GOAI 初赛准备任务', metadata: { status: 'planning' } },
    { id: 'e2', type: 'approval_required', stepId: null, occurredAt: '2026-08-13T21:30:02+08:00', summary: '七步任务计划已生成，等待执行授权。', metadata: {} },
    { id: 'e3', type: 'tool_started', stepId: 'rules', occurredAt: '2026-08-13T21:31:00+08:00', summary: '开始执行：整理官方规则和证据', metadata: { tool: 'official_rules_snapshot' } },
    { id: 'e4', type: 'tool_completed', stepId: 'rules', occurredAt: '2026-08-13T21:31:01+08:00', summary: '已整理 2026-08-11 捕获的 GOAI 初赛规则快照。', metadata: {} },
    { id: 'e5', type: 'tool_started', stepId: 'fit', occurredAt: '2026-08-13T21:31:02+08:00', summary: '开始执行：分析 LIVE IN HDU 与 AI+教育的匹配关系', metadata: { tool: 'goai_task_planner' } },
    { id: 'e6', type: 'tool_completed', stepId: 'fit', occurredAt: '2026-08-13T21:31:03+08:00', summary: '已生成围绕新生入学准备与信息澄清场景的有界计划。', metadata: {} },
    { id: 'e7', type: 'tool_started', stepId: 'brief', occurredAt: '2026-08-13T21:31:04+08:00', summary: '开始执行：生成 500 字以内作品简介', metadata: { tool: 'submission_brief_generator' } },
    { id: 'e8', type: 'tool_completed', stepId: 'brief', occurredAt: '2026-08-13T21:31:05+08:00', summary: '已生成待校验的 537 Unicode 字符作品简介初稿。', metadata: { characterCount: 537, limit: 500 } },
    { id: 'e9', type: 'tool_started', stepId: 'validate', occurredAt: '2026-08-13T21:31:06+08:00', summary: '开始执行：校验并修订作品简介', metadata: { tool: 'submission_brief_validator' } },
    { id: 'e10', type: 'validation_failed', stepId: 'validate', occurredAt: '2026-08-13T21:31:07+08:00', summary: '校验失败：作品简介初稿为 537 Unicode 字符，超过 500 字限制。', metadata: { characterCount: 537 } },
    { id: 'e11', type: 'tool_completed', stepId: 'validate', occurredAt: '2026-08-13T21:31:08+08:00', summary: '作品简介由 537 Unicode 字符修订为 492 Unicode 字符并通过限制。', metadata: { initialCharacterCount: 537, finalCharacterCount: 492, limit: 500, valid: true } },
    { id: 'e12', type: 'validation_passed', stepId: 'validate', occurredAt: '2026-08-13T21:31:08+08:00', summary: '校验通过：作品简介已修订为 492 Unicode 字符。', metadata: { characterCount: 492 } },
    { id: 'e13', type: 'tool_started', stepId: 'checklist', occurredAt: '2026-08-13T21:31:09+08:00', summary: '开始执行：创建初赛任务清单', metadata: { tool: 'system_checklist_creator' } },
    { id: 'e14', type: 'tool_completed', stepId: 'checklist', occurredAt: '2026-08-13T21:31:10+08:00', summary: '已创建初赛材料与人工确认清单。', metadata: {} },
    { id: 'e15', type: 'tool_started', stepId: 'package', occurredAt: '2026-08-13T21:31:11+08:00', summary: '开始执行：整理可下载成果', metadata: { tool: 'artifact_packager' } },
    { id: 'e16', type: 'tool_completed', stepId: 'package', occurredAt: '2026-08-13T21:31:12+08:00', summary: 'Demo 产物清单已就绪；未执行任何外部提交。', metadata: { packageReady: true } },
    { id: 'e17', type: 'status', stepId: null, occurredAt: '2026-08-13T21:31:13+08:00', summary: '任务执行完成，等待外部提交确认。', metadata: { status: 'awaiting_user_confirmation' } },
  ],
  artifacts: [
    { id: 'goai-rules', kind: 'rules', filename: 'GOAI_规则快照.md', mimeType: 'text/markdown; charset=utf-8', content: '# GOAI 规则快照\n\n比赛：LIVE IN HDU GOAI 无界应用赛道\n赛道：Boundless Agents\n初赛截止：2026-08-16\n作品简介上限：500 Unicode 字符\n初赛材料：作品简介、方案 PPT/PDF、作品附件 ZIP\n评审权重：场景价值 25%；Agent 能力 25%；产品体验 20%；技术实现 15%；安全合规 10%；开放复用 5%\n\nGOAI 官网最终提交必须由用户确认。', characterCount: null, validatedAt: null },
    { id: 'goai-plan', kind: 'outline', filename: 'GOAI_任务计划.md', mimeType: 'text/markdown; charset=utf-8', content: '# GOAI 任务计划\n\n场景：新生入学准备与校园信息澄清\n\n1. 核对规则和证据\n2. 生成并校验作品简介\n3. 创建材料清单并整理下载包\n4. 最终外部提交等待用户确认', characterCount: null, validatedAt: null },
    { id: 'goai-brief-draft', kind: 'brief', filename: 'GOAI_作品简介_初稿.txt', mimeType: 'text/plain; charset=utf-8', content: 'LIVE IN HDU 是面向高校新生校园适应的可验证智能体原型。参赛聚焦 GOAI 无界应用赛道中的"新生入学准备与校园信息澄清"场景：当学生提出住宿、报到、材料问题时，系统创建任务，而不把一次生成当作结论。智能体先整理校园指南和 GOAI 规则快照，再将问题拆成规则核对、任务规划、作品简介生成、系统清单和成果打包等工具步骤。各步留下来源、证据等级、产物和校验结果。演示中，简介初稿经校验报告 537 字失败，修订为 492 字并通过；这展示任务、工具、验证的闭环，而不是宣称模型自动正确。产品定位是把校园服务中的模糊需求转成可追踪的协作任务。对外发布、GOAI 最终提交都必须停在用户确认门前，不会自动提交。工程路线推进：先固化本地规则和证据；再接入受控知识源和人工复核；后续才评估平台连接与开放复用。该原型不声称已有用户规模、合作伙伴、成功率或生产级飞书集成。工具不调用外部模型或接口，固定输入得到固定输出，缺证时转交人工。初赛材料包括作品简介、方案 PPT 或 PDF 与作品附件 ZIP；评审可按场景价值、Agent 能力、产品体验、技术实现、安全合规和开放复用复核。待。初稿特意保留超限说明，供校验工具发现并修订为合规版本，过程可回放、可复查、可审计。待审。', characterCount: 537, validatedAt: null },
    { id: 'goai-brief', kind: 'brief', filename: 'GOAI_作品简介.txt', mimeType: 'text/plain; charset=utf-8', content: 'LIVE IN HDU 是面向高校新生校园适应的可验证智能体原型。参赛聚焦 GOAI 无界应用赛道中的"新生入学准备与校园信息澄清"场景：当学生提出住宿、报到、材料问题时，系统创建任务，而不把一次生成当作结论。智能体先整理校园指南和 GOAI 规则快照，再将问题拆成规则核对、任务规划、作品简介生成、系统清单和成果打包等工具步骤。各步留下来源、证据等级、产物和校验结果。演示中，简介初稿经校验报告 537 字失败，修订为 492 字并通过；这展示任务、工具、验证的闭环，而不是宣称模型自动正确。产品定位是把校园服务中的模糊需求转成可追踪的协作任务。对外发布、GOAI 最终提交都必须停在用户确认门前，不会自动提交。工程路线推进：先固化本地规则和证据；再接入受控知识源和人工复核；后续才评估平台连接与开放复用。该原型不声称已有用户规模、合作伙伴、成功率或生产级飞书集成。工具不调用外部模型或接口，固定输入得到固定输出，缺证时转交人工。初赛材料包括作品简介、方案 PPT 或 PDF 与作品附件 ZIP；评审可按场景价值、Agent 能力、产品体验、技术实现、安全合规和开放复用复核。待。', characterCount: 492, validatedAt: '2026-08-13T21:31:08+08:00' },
    { id: 'goai-checklist', kind: 'checklist', filename: 'GOAI_初赛清单.md', mimeType: 'text/markdown; charset=utf-8', content: '# GOAI 初赛清单\n\n- [x] 作品简介不超过 500 Unicode 字符\n- [x] 方案 PPT 或 PDF 已由人工检查\n- [x] 作品附件 ZIP 已整理\n- [x] 来源和证据等级已核对\n- [ ] GOAI 官网最终提交等待用户确认', characterCount: null, validatedAt: null },
    { id: 'goai-package', kind: 'compliance', filename: 'GOAI_成果包清单.md', mimeType: 'text/markdown; charset=utf-8', content: '# GOAI 成果包清单\n\n任务：demo-task-goai-20260813\n\n已包含：规则快照、任务计划、已校验作品简介、初赛清单。\n\n外部提交状态：awaiting_user_confirmation。', characterCount: null, validatedAt: null },
  ],
  sources: [
    { title: 'GOAI 无界应用赛道官网', url: 'https://goai.example.com/track/boundless-agents', capturedAt: '2026-08-11', level: 'official' as const },
    { title: 'GOAI 无界应用 Boundless Agents 参赛手册', url: 'https://goai.example.com/handbook/boundless-agents-2026', capturedAt: '2026-08-11', level: 'official' as const },
  ],
  createdAt: '2026-08-13T21:30:00+08:00',
  updatedAt: '2026-08-13T21:31:13+08:00',
};

// ==================== 响应式状态 ====================
const route = useRoute();
const goal = ref(DEFAULT_GOAL);
const task = ref<typeof DEMO_TASK | null>(null);
const busy = ref(false);
const errorMessage = ref('');
const replayMode = ref(false);
const replayCount = ref(0);
const currentPhase = ref(0); // 0=初始, 1=计划, 2=确认, 3=执行中, 4=537失败, 5=492通过, 6=成果, 7=确认门
const autoPlaying = ref(false);
const showValidationFailed = ref(false);
const showValidationPassed = ref(false);
let replayTimer: ReturnType<typeof setInterval> | null = null;

// ==================== 计算属性 ====================
const title = computed(() => 'GOAI 无界应用赛道初赛准备');
const sortedEvents = computed(() => [...(task.value?.events ?? [])].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)));
const visibleEvents = computed(() => replayMode.value ? sortedEvents.value.slice(0, replayCount.value) : sortedEvents.value);
const validationFailed = computed(() => visibleEvents.value.find((event) => event.type === 'validation_failed') ?? null);
const validationPassed = computed(() => visibleEvents.value.find((event) => event.type === 'validation_passed') ?? null);
const completedSteps = computed(() => task.value?.steps.filter((step: any) => step.status === 'completed').length ?? 0);
const totalSteps = computed(() => task.value?.steps.length ?? 7);
const progressPercent = computed(() => totalSteps.value ? (completedSteps.value / totalSteps.value) * 100 : 0);

// ==================== 辅助函数 ====================
function evidenceLabel(level: string): string {
  return { existing: '现有证据', prototype: '初赛原型', roadmap: '复赛路线' }[level] || level;
}

function stepStatusLabel(status: string): string {
  return { pending: '待执行', running: '执行中', completed: '已完成', failed: '失败', blocked: '等待确认' }[status] || status;
}

function artifactKindLabel(kind: string): string {
  return { rules: '规则快照', brief: '作品简介', outline: '方案大纲', compliance: '合规说明', checklist: '任务清单' }[kind] || kind;
}

function displayDate(value: string): string {
  return value.slice(0, 10).replaceAll('-', '.');
}

function displayTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }).format(parsed);
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

// ==================== 演示控制 ====================
function createTask(): void {
  if (!goal.value.trim() || busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  clearReplayTimer();
  
  // 模拟创建任务
  setTimeout(() => {
    task.value = JSON.parse(JSON.stringify(DEMO_TASK));
    task.value.goal = goal.value.trim();
    replayMode.value = true;
    replayCount.value = 0;
    currentPhase.value = 1;
    busy.value = false;
    beginReplay();
  }, 600);
}

function approveAndRun(): void {
  if (!task.value || busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  clearReplayTimer();
  
  // 模拟确认执行
  setTimeout(() => {
    currentPhase.value = 3;
    task.value = JSON.parse(JSON.stringify(DEMO_TASK));
    task.value.status = 'running';
    task.value.executionApproval = 'approved';
    task.value.progress = { completed: 0, total: 7 };
    task.value.steps.forEach((step: any) => {
      step.status = 'pending';
      step.startedAt = null;
      step.completedAt = null;
      step.resultSummary = null;
      step.error = null;
    });
    
    // 开始执行动画
    startExecutionAnimation();
  }, 500);
}

function startExecutionAnimation(): void {
  const steps = task.value!.steps;
  const events = task.value!.events;
  let stepIndex = 0;
  let eventIndex = 0;
  
  // 找到第一个 tool_started 事件
  const toolEvents = events.filter((e: any) => e.type === 'tool_started' || e.type === 'tool_completed' || e.type === 'validation_failed' || e.type === 'validation_passed');
  
  function processNext(): void {
    if (stepIndex >= steps.length) {
      // 执行完成
      task.value!.status = 'awaiting_confirmation';
      task.value!.progress = { completed: 6, total: 7 };
      steps.forEach((step: any) => {
        if (step.id !== 'submit') step.status = 'completed';
      });
      steps[6].status = 'pending';
      currentPhase.value = 7;
      busy.value = false;
      return;
    }
    
    const step = steps[stepIndex];
    step.status = 'running';
    step.startedAt = new Date().toISOString();
    task.value!.progress = { completed: stepIndex, total: 7 };
    
    setTimeout(() => {
      step.status = 'completed';
      step.completedAt = new Date().toISOString();
      step.resultSummary = events.find((e: any) => e.stepId === step.id && e.type === 'tool_completed')?.summary || '';
      
      // 特殊处理校验步骤
      if (step.id === 'validate') {
        const failedEvent = events.find((e: any) => e.type === 'validation_failed');
        const passedEvent = events.find((e: any) => e.type === 'validation_passed');
        if (failedEvent) {
          currentPhase.value = 4;
          showValidationFailed.value = true;
          setTimeout(() => {
            showValidationFailed.value = false;
            if (passedEvent) {
              currentPhase.value = 5;
              showValidationPassed.value = true;
              setTimeout(() => {
                showValidationPassed.value = false;
                currentPhase.value = 6;
              }, 1500);
            }
          }, 2000);
        }
      }
      
      stepIndex++;
      setTimeout(processNext, 400);
    }, 800);
  }
  
  processNext();
}

function resetDemo(): void {
  clearReplayTimer();
  task.value = null;
  goal.value = DEFAULT_GOAL;
  currentPhase.value = 0;
  replayMode.value = false;
  replayCount.value = 0;
  autoPlaying.value = false;
  showValidationFailed.value = false;
  showValidationPassed.value = false;
  busy.value = false;
  errorMessage.value = '';
}

function downloadArtifact(filename: string): void {
  const content = task.value?.artifacts.find((a: any) => a.filename === filename)?.content || '';
  const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function previewArtifact(artifact: any): void {
  alert(`【${artifact.filename}】\n\n${artifact.content}`);
}

// ==================== 生命周期 ====================
onMounted(() => {
  if (route.query.autoplay === '1' && !task.value) {
    setTimeout(() => {
      createTask();
      setTimeout(() => {
        if (task.value && currentPhase.value >= 1) {
          approveAndRun();
        }
      }, 1200);
    }, 300);
  }
});

onBeforeUnmount(() => {
  clearReplayTimer();
});

// 初始状态
task.value = null;
currentPhase.value = 0;
</script>

<template>
  <main class="goai-demo-workspace">
    <!-- 事实标签 -->
    <div class="fact-banner">
      <span class="fact-tag">初赛演示回放</span>
      <span class="fact-text">基于真实本地执行记录；不代表 GOAI 官网或飞书生产系统已自动完成操作。</span>
    </div>

    <div class="demo-container">
      <!-- 阶段 0：初始状态 -->
      <section v-if="currentPhase === 0" class="phase-hero">
        <div class="hero-content">
          <p class="hero-kicker">LIVE IN HDU / GOAI 无界应用赛道</p>
          <h1 class="hero-title">一句话，把大学生成长目标推进到可提交。</h1>
          <p class="hero-subtitle">Agent 不只是聊天。它会规划、调用工具、校验、交付，并把最终提交权留给你。</p>
        </div>
        <form class="goal-form" @submit.prevent="createTask">
          <label for="demo-goal">任务目标</label>
          <div class="goal-control">
            <textarea
              id="demo-goal"
              v-model="goal"
              rows="2"
              maxlength="500"
              :disabled="busy"
              placeholder="我想参加 GOAI，帮我把初赛准备好"
            />
            <button type="submit" :disabled="busy || !goal.trim()">
              {{ busy ? '正在创建…' : '创建任务' }}
            </button>
          </div>
        </form>
      </section>

      <!-- 阶段 1-7：任务执行 -->
      <template v-if="task">
        <!-- 任务头部 -->
        <section class="task-header">
          <div class="task-title-area">
            <p class="task-id">TASK / {{ task.id }}</p>
            <h2>{{ title }}</h2>
            <p class="task-goal">{{ task.goal }}</p>
          </div>
          <div class="task-metrics">
            <div>
              <dt>截止日期</dt>
              <dd>{{ displayDate(task.deadline) }}</dd>
            </div>
            <div>
              <dt>进度</dt>
              <dd>{{ completedSteps }} / {{ totalSteps }}</dd>
            </div>
          </div>
          <div class="progress-block">
            <div class="progress-track" role="progressbar" :aria-valuenow="completedSteps" :aria-valuemax="totalSteps" aria-valuemin="0">
              <span :style="{ width: `${progressPercent}%` }" />
            </div>
            <p aria-live="polite">
              {{ currentPhase <= 2 ? '已创建' : currentPhase === 7 ? '等待用户确认' : '执行中' }}
            </p>
          </div>
        </section>

        <!-- 确认门 -->
        <section v-if="currentPhase === 1 || currentPhase === 2" class="approval-gate">
          <div>
            <span class="gate-index">01 / EXECUTION GATE</span>
            <h2>等待执行确认</h2>
            <p>共 {{ task.steps.length }} 步任务计划；界面仅呈现演示记录。</p>
          </div>
          <button type="button" @click="approveAndRun" :disabled="busy">
            {{ busy ? '执行中…' : '确认并执行' }}
          </button>
        </section>

        <!-- 执行中 / 成果 -->
        <div class="workspace-grid">
          <!-- 执行计划 -->
          <section class="workspace-panel plan-panel">
            <header class="panel-heading">
              <div>
                <p>PLAN / {{ task.steps.length }} STEPS</p>
                <h2>执行计划</h2>
              </div>
              <span>{{ completedSteps }} 已完成</span>
            </header>
            <ol class="step-list">
              <li v-for="(step, index) in task.steps" :key="step.id" :data-status="step.status">
                <span class="step-number">{{ String(Number(index) + 1).padStart(2, '0') }}</span>
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

          <!-- 执行时间线 -->
          <section class="workspace-panel timeline-panel">
            <header class="panel-heading">
              <div>
                <p>EXECUTION LOG</p>
                <h2>执行时间线</h2>
              </div>
              <span>{{ visibleEvents.length }} / {{ sortedEvents.length }}</span>
            </header>
            <ol class="event-timeline" aria-live="polite">
              <li v-for="event in visibleEvents" :key="event.id" :data-event-type="event.type">
                <time :datetime="event.occurredAt">{{ displayTime(event.occurredAt) }}</time>
                <span class="event-node" aria-hidden="true" />
                <p>
                  {{ event.summary }}
                  <strong v-if="event.type === 'validation_failed' || event.type === 'validation_passed'">
                    · {{ event.metadata.characterCount }}
                  </strong>
                </p>
              </li>
            </ol>
          </section>

          <!-- 成果文件 -->
          <section class="workspace-panel artifact-panel">
            <header class="panel-heading">
              <div>
                <p>OUTPUTS</p>
                <h2>成果文件</h2>
              </div>
              <span>{{ task.artifacts.length }} 份</span>
            </header>
            <ul class="artifact-list">
              <li v-for="artifact in task.artifacts" :key="artifact.id">
                <div>
                  <span class="file-kind">{{ artifactKindLabel(artifact.kind) }}</span>
                  <strong>{{ artifact.filename }}</strong>
                  <small>{{ artifact.validatedAt ? '已验证' : '待验证' }}</small>
                </div>
                <div class="artifact-actions">
                  <button type="button" class="btn-small" @click="previewArtifact(artifact)">预览</button>
                  <button type="button" class="btn-small btn-primary" @click="downloadArtifact(artifact.filename)">下载</button>
                </div>
              </li>
            </ul>
          </section>

          <!-- 来源与证据 -->
          <section class="workspace-panel source-panel">
            <header class="panel-heading">
              <div>
                <p>EVIDENCE</p>
                <h2>来源与证据</h2>
              </div>
              <span>{{ task.sources.length }} 条</span>
            </header>
            <ul class="source-list">
              <li v-for="source in task.sources" :key="`${source.url}:${source.title}`">
                <div>
                  <a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }}</a>
                  <small>抓取日期 {{ source.capturedAt }}</small>
                </div>
                <span :data-evidence="source.level">{{ evidenceLabel(source.level) }}</span>
              </li>
            </ul>
          </section>
        </div>

        <!-- 验证条 -->
        <section v-if="showValidationFailed || showValidationPassed" class="validation-strip" aria-label="字数验证结果">
          <article v-if="showValidationFailed" class="validation-failed" aria-live="polite">
            <span>VALIDATION / REVISED</span>
            <strong>537</strong>
            <p>作品简介初稿为 537 Unicode 字符，超过 500 字限制。</p>
          </article>
          <article v-if="showValidationPassed" class="validation-passed" aria-live="polite">
            <span>VALIDATION / PASSED</span>
            <strong>492</strong>
            <p>作品简介已修订为 492 Unicode 字符并通过限制。</p>
          </article>
        </section>

        <!-- 确认门 -->
        <section v-if="currentPhase === 7" class="submission-gate">
          <div>
            <span class="gate-index">07 / EXTERNAL ACTION</span>
            <h2>等待用户确认</h2>
            <p>GOAI 官网最终提交不会自动进行。请人工核对成果后完成对外操作。</p>
          </div>
          <span class="submission-state">未提交</span>
        </section>

        <!-- 控制栏 -->
        <div class="demo-controls">
          <button type="button" @click="resetDemo">重新演示</button>
          <span class="control-hint">当前阶段：{{ currentPhase === 0 ? '初始' : currentPhase === 1 ? '计划' : currentPhase === 2 ? '确认' : currentPhase === 3 ? '执行中' : currentPhase === 4 ? '537 失败' : currentPhase === 5 ? '492 通过' : currentPhase === 6 ? '成果' : '确认门' }}</span>
        </div>
      </template>
    </div>
  </main>
</template>

<style scoped>
/* ==================== 视觉系统（与 AgentDemoView 一致） ==================== */
.goai-demo-workspace {
  --agent-bg: #111315;
  --agent-panel: #191c1f;
  --agent-panel-soft: #202428;
  --agent-line: rgb(255 255 255 / 10%);
  --agent-text: #f3f0e9;
  --agent-muted: #9da5aa;
  --agent-coral: #ff725c;
  --agent-cyan: #42d9e8;
  --agent-amber: #FFC857;
  --agent-green: #43E6A0;
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

/* 事实标签 */
.fact-banner {
  max-width: 1376px;
  margin: 0 auto 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border: 1px solid rgb(66 217 232 / 30%);
  border-radius: 999px;
  background: rgb(66 217 232 / 8%);
}
.fact-tag {
  color: var(--agent-cyan);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  padding: 4px 10px;
  border: 1px solid rgb(66 217 232 / 40%);
  border-radius: 999px;
}
.fact-text {
  color: var(--agent-muted);
  font-size: 0.82rem;
}

.demo-container {
  max-width: 1376px;
  margin: 0 auto;
}

/* 阶段 0：英雄区 */
.phase-hero {
  margin-bottom: 18px;
  padding: 32px;
  border: 1px solid var(--agent-line);
  border-radius: 20px;
  background: linear-gradient(135deg, rgb(31 35 38 / 96%), rgb(20 23 25 / 96%));
}
.hero-kicker {
  margin: 0 0 9px;
  color: var(--agent-cyan);
  font-size: 0.71rem;
  font-weight: 800;
  letter-spacing: 0.16em;
}
.hero-title {
  margin: 0;
  max-width: 760px;
  font-size: clamp(1.65rem, 3vw, 3rem);
  line-height: 1.08;
  letter-spacing: -0.04em;
}
.hero-subtitle {
  margin: 12px 0 0;
  color: var(--agent-muted);
  line-height: 1.75;
  max-width: 680px;
}

/* 目标表单 */
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
.goal-control button,
.artifact-actions .btn-small,
.demo-controls button {
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
button:hover:not(:disabled) {
  filter: brightness(1.08);
  transform: translateY(-1px);
}
button:disabled {
  cursor: wait;
  opacity: 0.58;
}

/* 任务头部 */
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
  margin: 0;
}
.task-goal {
  margin-top: 8px !important;
  color: var(--agent-muted);
}
.task-id {
  margin: 0 0 4px;
  color: var(--agent-cyan);
  font-size: 0.71rem;
  font-weight: 800;
  letter-spacing: 0.16em;
}
.task-metrics {
  display: flex;
  gap: 28px;
  margin: 0;
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

/* 确认门 / 提交门 */
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
  margin: 0;
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
.gate-index {
  margin: 0 0 9px;
  color: var(--agent-coral);
  font-size: 0.71rem;
  font-weight: 800;
  letter-spacing: 0.16em;
}
.submission-gate .gate-index {
  color: var(--agent-cyan);
}

/* 工作区网格 */
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
  margin: 0;
}
.panel-heading > span {
  color: var(--agent-muted);
  font-size: 0.76rem;
}
.panel-heading p {
  margin: 0 0 9px;
  color: var(--agent-cyan);
  font-size: 0.71rem;
  font-weight: 800;
  letter-spacing: 0.16em;
}

/* 步骤列表 */
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
.step-list li:last-child {
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
.step-list h3 {
  margin: 0;
  font-size: 0.88rem;
}
.step-list p {
  margin: 4px 0 0;
  color: var(--agent-muted);
  font-size: 0.72rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.step-meta {
  display: grid;
  justify-items: end;
  gap: 5px;
}
.step-meta span {
  color: var(--agent-cyan);
  font-size: 0.68rem;
}
.step-meta strong {
  font-size: 0.71rem;
}

/* 时间线 */
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
.event-timeline [data-event-type="validation_passed"] .event-node {
  background: var(--agent-green);
}

/* 成果列表 */
.artifact-list li,
.source-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  padding: 13px 0;
  border-bottom: 1px solid var(--agent-line);
}
.artifact-list li:last-child,
.source-list li:last-child {
  border-bottom: 0;
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
.artifact-actions {
  display: flex;
  gap: 8px;
}
.artifact-actions .btn-small {
  min-height: 36px;
  padding: 0 14px;
  font-size: 0.75rem;
  background: transparent;
  color: var(--agent-cyan);
  border: 1px solid rgb(66 217 232 / 40%);
}
.artifact-actions .btn-primary {
  background: var(--agent-coral);
  color: #121416;
  border-color: var(--agent-coral);
}

/* 来源列表 */
.source-list a {
  text-decoration-color: rgb(66 217 232 / 58%);
  text-underline-offset: 3px;
}

/* 验证条 */
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
.validation-strip .validation-passed {
  border-color: rgb(66 217 232 / 30%);
  background: rgb(66 217 232 / 8%);
}
.validation-strip article > span {
  margin: 0;
  color: var(--agent-coral);
  font-size: 0.71rem;
  font-weight: 800;
  letter-spacing: 0.16em;
}
.validation-strip .validation-passed > span {
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

/* 控制栏 */
.demo-controls {
  margin-top: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.demo-controls button {
  min-height: 44px;
  padding-inline: 20px;
  border: 1px solid var(--agent-cyan);
  background: transparent;
  color: var(--agent-cyan);
  border-radius: 11px;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.demo-controls button:hover {
  background: rgb(66 217 232 / 10%);
}
.control-hint {
  color: var(--agent-muted);
  font-size: 0.82rem;
}

/* 响应式 */
@media (min-width: 1200px) {
  .goai-demo-workspace {
    padding-top: 24px;
  }
  .hero-title {
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
  .workspace-grid {
    grid-template-columns: 1fr;
  }
  .hero-title {
    font-size: 1.8rem;
  }
}

@media (max-width: 640px) {
  .goai-demo-workspace {
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
  .demo-controls {
    flex-direction: column;
    align-items: stretch;
  }
  .workspace-panel {
    padding: 17px;
  }
  .step-list li {
    grid-template-columns: 32px minmax(0, 1fr);
  }
  .step-meta {
    grid-column: 2;
    justify-content: space-between;
  }
  .event-timeline li {
    grid-template-columns: 62px 12px minmax(0, 1fr);
  }
  .artifact-actions {
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .goai-demo-workspace *,
  .goai-demo-workspace *::before,
  .goai-demo-workspace *::after {
    scroll-behavior: auto !important;
    animation: none !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
