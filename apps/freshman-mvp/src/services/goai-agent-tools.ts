import type { AgentArtifact, AgentSource, AgentTask } from '../domain/agent-task.js';
import { GOAI_RULES, GOAI_SOURCES } from '../content/goai-demo-rules.js';
import { ValidationError } from '../domain/errors.js';

export type GoaiToolName =
  | 'official_rules_snapshot'
  | 'goai_task_planner'
  | 'submission_brief_generator'
  | 'submission_brief_validator'
  | 'system_checklist_creator'
  | 'artifact_packager';

export interface GoaiToolResult {
  summary: string;
  artifacts: AgentArtifact[];
  sources: AgentSource[];
  metadata: Record<string, string | number | boolean | null>;
}

export interface GoaiToolContext {
  task: AgentTask;
  now: () => string;
}

export type GoaiTool = (context: GoaiToolContext) => Promise<GoaiToolResult>;

export function countUnicodeCharacters(value: string): number {
  return Array.from(value.trim()).length;
}

export const GOAI_BRIEF_FINAL_492 = `LIVE IN HDU 是面向高校新生校园适应的可验证智能体原型。参赛聚焦 GOAI 无界应用赛道中的“新生入学准备与校园信息澄清”场景：当学生提出住宿、报到、材料问题时，系统创建任务，而不把一次生成当作结论。智能体先整理校园指南和 GOAI 规则快照，再将问题拆成规则核对、任务规划、作品简介生成、系统清单和成果打包等工具步骤。各步留下来源、证据等级、产物和校验结果。演示中，简介初稿经校验报告 537 字失败，修订为 492 字并通过；这展示任务、工具、验证的闭环，而不是宣称模型自动正确。产品定位是把校园服务中的模糊需求转成可追踪的协作任务。对外发布、GOAI 最终提交都必须停在用户确认门前，不会自动提交。工程路线推进：先固化本地规则和证据；再接入受控知识源和人工复核；后续才评估平台连接与开放复用。该原型不声称已有用户规模、合作伙伴、成功率或生产级飞书集成。工具不调用外部模型或接口，固定输入得到固定输出，缺证时转交人工。初赛材料包括作品简介、方案 PPT 或 PDF 与作品附件 ZIP；评审可按场景价值、Agent 能力、产品体验、技术实现、安全合规和开放复用复核。待。`;

export const GOAI_BRIEF_DRAFT_537 = `${GOAI_BRIEF_FINAL_492} 初稿特意保留超限说明，供校验工具发现并修订为合规版本，过程可回放、可复查、可审计。待审。`;

if (countUnicodeCharacters(GOAI_BRIEF_DRAFT_537) !== 537) {
  throw new Error('GOAI demo draft must contain exactly 537 Unicode characters');
}
if (countUnicodeCharacters(GOAI_BRIEF_FINAL_492) !== 492) {
  throw new Error('GOAI demo final brief must contain exactly 492 Unicode characters');
}

function artifact(
  id: string,
  kind: AgentArtifact['kind'],
  filename: string,
  content: string,
  characterCount: number | null = null,
  validatedAt: string | null = null,
): AgentArtifact {
  return {
    id,
    kind,
    filename,
    mimeType: filename.endsWith('.txt') ? 'text/plain; charset=utf-8' : 'text/markdown; charset=utf-8',
    content,
    characterCount,
    validatedAt,
  };
}

const officialRulesSnapshot: GoaiTool = async () => ({
  summary: '已整理 2026-08-11 捕获的 GOAI 初赛规则快照。',
  artifacts: [artifact('goai-rules', 'rules', 'GOAI_规则快照.md', [
    `比赛：${GOAI_RULES.competition}`,
    `赛道：${GOAI_RULES.track}`,
    `初赛截止：${GOAI_RULES.initialDeadline}`,
    `作品简介上限：${GOAI_RULES.introLimit} Unicode 字符`,
    `初赛材料：${GOAI_RULES.requiredInitialItems.join('；')}`,
    `评审权重：${GOAI_RULES.evaluation.map(([name, weight]) => `${name} ${weight}`).join('；')}`,
    'GOAI 官网最终提交必须由用户确认。',
  ].join('\n'))],
  sources: GOAI_SOURCES,
  metadata: { deadline: GOAI_RULES.initialDeadline, introLimit: GOAI_RULES.introLimit, finalSubmissionRequiresUserConfirmation: true },
});

const goaiTaskPlanner: GoaiTool = async () => ({
  summary: '已生成围绕新生入学准备与信息澄清场景的有界计划。',
  artifacts: [artifact('goai-plan', 'outline', 'GOAI_任务计划.md', '场景：新生入学准备与校园信息澄清\n1. 核对规则和证据。\n2. 生成并校验作品简介。\n3. 创建材料清单并整理下载包。\n4. 最终外部提交等待用户确认。')],
  sources: [],
  metadata: { scenario: '新生入学准备与校园信息澄清', externalSubmission: 'awaiting_user_confirmation' },
});

const submissionBriefGenerator: GoaiTool = async () => ({
  summary: '已生成待校验的 537 Unicode 字符作品简介初稿。',
  artifacts: [artifact('goai-brief-draft', 'brief', 'GOAI_作品简介_初稿.txt', GOAI_BRIEF_DRAFT_537, countUnicodeCharacters(GOAI_BRIEF_DRAFT_537))],
  sources: [],
  metadata: { characterCount: countUnicodeCharacters(GOAI_BRIEF_DRAFT_537), limit: GOAI_RULES.introLimit, valid: false },
});

const submissionBriefValidator: GoaiTool = async (context) => {
  const draft = context.task.artifacts.find((item) => item.id === 'goai-brief-draft');
  if (!draft || draft.kind !== 'brief') {
    throw new ValidationError('未找到待校验的 GOAI 作品简介初稿。');
  }
  const initialCharacterCount = countUnicodeCharacters(draft.content);
  if (
    draft.content !== GOAI_BRIEF_DRAFT_537
    || draft.characterCount !== 537
    || initialCharacterCount !== 537
    || initialCharacterCount <= GOAI_RULES.introLimit
  ) {
    throw new ValidationError('GOAI 作品简介初稿必须是待校验的 537 Unicode 字符超限版本。');
  }
  const finalCharacterCount = countUnicodeCharacters(GOAI_BRIEF_FINAL_492);
  return {
    summary: `作品简介由 ${initialCharacterCount} Unicode 字符修订为 ${finalCharacterCount} Unicode 字符并通过限制。`,
    artifacts: [artifact(draft.id, draft.kind, 'GOAI_作品简介.txt', GOAI_BRIEF_FINAL_492, finalCharacterCount, context.now())],
    sources: [],
    metadata: { initialCharacterCount, finalCharacterCount, limit: GOAI_RULES.introLimit, valid: finalCharacterCount <= GOAI_RULES.introLimit },
  };
};

const systemChecklistCreator: GoaiTool = async () => ({
  summary: '已创建初赛材料与人工确认清单。',
  artifacts: [artifact('goai-checklist', 'checklist', 'GOAI_初赛清单.md', '□ 作品简介不超过 500 Unicode 字符\n□ 方案 PPT 或 PDF 已由人工检查\n□ 作品附件 ZIP 已整理\n□ 来源和证据等级已核对\n□ GOAI 官网最终提交等待用户确认')],
  sources: [],
  metadata: { requiredItems: GOAI_RULES.requiredInitialItems.length, finalSubmissionRequiresUserConfirmation: true },
});

const artifactPackager: GoaiTool = async (context) => {
  const requiredArtifacts = [
    ['goai-rules', (item: AgentArtifact) => item.kind === 'rules'],
    ['goai-plan', (item: AgentArtifact) => item.kind === 'outline'],
    ['goai-brief-draft', (item: AgentArtifact) => item.kind === 'brief' && item.content === GOAI_BRIEF_FINAL_492 && countUnicodeCharacters(item.content) === 492],
    ['goai-checklist', (item: AgentArtifact) => item.kind === 'checklist'],
  ] as const;
  const missingArtifacts = requiredArtifacts
    .filter(([id, predicate]) => !context.task.artifacts.some((item) => item.id === id && predicate(item)))
    .map(([id]) => id);
  const packageReady = missingArtifacts.length === 0;
  const contents = packageReady
    ? '已包含：规则快照、任务计划、已校验作品简介、初赛清单。'
    : `缺少：${missingArtifacts.join('、')}。`;
  return {
    summary: packageReady ? 'Demo 产物清单已就绪；未执行任何外部提交。' : 'Demo 产物清单前置产物不完整，尚不能标记为就绪。',
    artifacts: [artifact('goai-package', 'compliance', 'GOAI_成果包清单.md', `任务：${context.task.id}\n${contents}\n外部提交状态：awaiting_user_confirmation。`)],
    sources: [],
    metadata: {
      packageReady,
      readinessScope: 'demo_artifact_manifest',
      missingArtifacts: missingArtifacts.join(',') || null,
      externalSubmission: 'awaiting_user_confirmation',
    },
  };
};

export const GOAI_TOOL_REGISTRY: Readonly<Record<GoaiToolName, GoaiTool>> = {
  official_rules_snapshot: officialRulesSnapshot,
  goai_task_planner: goaiTaskPlanner,
  submission_brief_generator: submissionBriefGenerator,
  submission_brief_validator: submissionBriefValidator,
  system_checklist_creator: systemChecklistCreator,
  artifact_packager: artifactPackager,
};

export async function executeGoaiTool(name: GoaiToolName, context: GoaiToolContext): Promise<GoaiToolResult> {
  return GOAI_TOOL_REGISTRY[name](context);
}
