# Approved Review Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让管理端“通过并发布”在一个 SQLite 事务中完成审核决策与公开问题发布，并在客户端立即生成可见问题卡片。

**Architecture:** 新增一个 SQLite 专用的审核发布仓储，直接在同一连接和同一事务中写入 `question_intents`、`intent_aliases`、`canonical_answers`、`canonical_answer_sources` 和 `review_tasks`。Fastify 审核路由在 `approved` 决策时调用该仓储，其他决策保持原路径；Vue 管理卡片显示就地错误和顶部成功信息。

**Tech Stack:** TypeScript 6、Fastify 5、SQLite、Vue 3、Node test runner、Vitest。

## Global Constraints

- 不重建或覆盖 `/srv/live-in-hdu/apps/freshman-mvp/runtime/live-in-hdu.db`。
- 保留现有23条已发布答案、全部历史版本和现有待审核队列。
- `approved` 发布和审核状态更新必须处于同一数据库事务。
- 允许人工审核通过的问题暂时没有来源，保存空 `sources` 数组。
- 新问题默认分类为 `补充问答`、不置顶、排序号为现有最大值加一。
- 不实现多人账号、角色权限、实时协作锁、域名或 HTTPS。
- 不提交或输出 `.env.local`、TokenDance API Key 或任何私钥。
- 当前工作树中已有未提交文件属于现有工作，实施时不得覆盖、回退或混入本功能提交。

---

### Task 1: SQLite 原子审核发布仓储

**Files:**
- Create: `apps/freshman-mvp/src/repositories/sqlite-approved-review-publisher.ts`
- Modify: `apps/freshman-mvp/src/repositories/contracts.ts`
- Modify: `apps/freshman-mvp/src/repositories/sqlite-review-repository.ts`
- Test: `apps/freshman-mvp/test/approved-review-publication.test.ts`

**Interfaces:**
- Consumes: `SqliteDatabase`、`ReviewDecision`、`ReviewTask`、`SourceRef`。
- Produces: `ApprovedReviewPublisher.publish(reviewId, decision)` 和 `ApprovedReviewPublicationResult`。

- [ ] **Step 1: 写原子发布失败测试**

创建集成测试，迁移临时 SQLite 数据库、插入一条 `pending` 任务，然后调用尚不存在的发布仓储：

```ts
const result = await publisher.publish(review.id, {
  status: 'approved',
  reviewerId: 'local-admin',
  note: '人工核验',
  reviewedAnswer: '宿舍通常没有统一熄灯时间，具体以楼栋通知和室友协商为准。',
  feedbackTarget: '补充问答',
});

assert.equal(result.review.status, 'approved');
assert.equal(result.createdIntent, true);
assert.equal(result.version, 1);
assert.equal((await content.listPublishedQuestions()).length, 1);
```

同一文件再写三项测试：第二条相同标准问题创建 v2 而不是第二个意图；数据库触发器中止 `canonical_answers` 插入时任务仍为 `pending`；重复处理同一个任务抛出 `ConflictError`。

- [ ] **Step 2: 运行测试并确认按预期失败**

Run:

```powershell
npx tsx --test test/approved-review-publication.test.ts
```

Expected: FAIL，原因是 `SqliteApprovedReviewPublisher` 或对应合同尚不存在。

- [ ] **Step 3: 定义合同和共享行映射**

在 `contracts.ts` 增加：

```ts
export interface ApprovedReviewPublicationResult {
  review: ReviewTask;
  intentId: string;
  version: number;
  createdIntent: boolean;
}

export interface ApprovedReviewPublisher {
  publish(reviewId: string, decision: ReviewDecision): Promise<ApprovedReviewPublicationResult>;
}
```

把 `sqlite-review-repository.ts` 的行转换函数导出为：

```ts
export function sqliteRowToReviewTask(row: Record<string, unknown>): ReviewTask;
```

- [ ] **Step 4: 实现最小 SQLite 事务**

`SqliteApprovedReviewPublisher` 必须：

```ts
database.exec('BEGIN IMMEDIATE');
try {
  // 读取 pending review；标准化比较现有 question_intents.question。
  // 未命中时插入 review-<uuid> 意图和首个 intent_aliases。
  // 插入下一个 canonical_answers 版本和已有来源。
  // 最后以 WHERE id = ? AND status = 'pending' 更新 review_tasks。
  database.exec('COMMIT');
} catch (error) {
  database.exec('ROLLBACK');
  throw error;
}
```

标准化函数使用 NFKC、去除空白和末尾中英文问号；简明答案取完整答案首个非空段落并按 Unicode 字符截到150字符。空来源数组合法，不插入 `canonical_answer_sources`。

- [ ] **Step 5: 运行仓储测试**

Run:

```powershell
npx tsx --test test/approved-review-publication.test.ts
```

Expected: 4项测试全部 PASS。

- [ ] **Step 6: 提交仓储实现**

```powershell
git add apps/freshman-mvp/src/repositories/contracts.ts `
  apps/freshman-mvp/src/repositories/sqlite-review-repository.ts `
  apps/freshman-mvp/src/repositories/sqlite-approved-review-publisher.ts `
  apps/freshman-mvp/test/approved-review-publication.test.ts
git commit -m "feat: publish approved reviews atomically"
```

### Task 2: 审核 API 与生产运行时接线

**Files:**
- Modify: `apps/freshman-mvp/src/server/app.ts`
- Modify: `apps/freshman-mvp/src/server/index.ts`
- Test: `apps/freshman-mvp/test/api-v2.test.ts`
- Test: `apps/freshman-mvp/test/e2e-v2.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `ApprovedReviewPublisher`。
- Produces: `POST /api/reviews/:id/decision` 的可选 `publication` 响应和生产环境 SQLite 注入。

- [ ] **Step 1: 写审核路由失败测试**

在 API 测试中注入发布器替身并断言：

```ts
assert.equal(response.statusCode, 200);
assert.deepEqual(response.json().publication, {
  intentId: 'review-123',
  version: 1,
  createdIntent: true,
});
```

再断言 `rejected` 与 `needs_more` 调用原 `reviews.decide`，不调用发布器。

- [ ] **Step 2: 运行目标测试确认失败**

```powershell
npx tsx --test test/api-v2.test.ts
```

Expected: FAIL，响应没有 `publication` 或依赖类型不接受发布器。

- [ ] **Step 3: 接入 Fastify 路由**

给 `AppDependencies` 增加：

```ts
approvedReviewPublisher?: Pick<ApprovedReviewPublisher, 'publish'>;
```

解析一次决策；当状态为 `approved` 时必须调用发布器。生产或测试未注入发布器时返回503，不能退回只改审核状态的旧行为。成功响应为：

```ts
{
  item: result.review,
  publication: {
    intentId: result.intentId,
    version: result.version,
    createdIntent: result.createdIntent,
  },
}
```

- [ ] **Step 4: 在生产 SQLite 运行时注入发布器**

在现有 SQLite 数据库连接创建完成后实例化：

```ts
approvedReviewPublisher = new SqliteApprovedReviewPublisher(database);
```

将其传给 `createApp`。修改 `src/server/index.ts` 时只补充所需导入、局部变量和依赖字段，保留该文件现有未提交的 Linux 路径修复。

- [ ] **Step 5: 运行 API 与生产运行时测试**

```powershell
npx tsx --test test/api-v2.test.ts test/e2e-v2.test.ts test/approved-review-publication.test.ts
```

Expected: 全部 PASS；Linux SQLite 路径测试继续通过。

- [ ] **Step 6: 提交接线修改**

```powershell
git add apps/freshman-mvp/src/server/app.ts `
  apps/freshman-mvp/src/server/index.ts `
  apps/freshman-mvp/test/api-v2.test.ts `
  apps/freshman-mvp/test/e2e-v2.test.ts
git commit -m "feat: publish approved reviews from admin API"
```

### Task 3: 管理卡片反馈和“通过并发布”语义

**Files:**
- Modify: `apps/freshman-mvp/web/api.ts`
- Modify: `apps/freshman-mvp/web/components/AdminReviewQueue.vue`
- Test: `apps/freshman-mvp/test/web/admin.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `publication` 响应。
- Produces: `ReviewDecisionResult`、卡片内错误和队列顶部发布成功提示。

- [ ] **Step 1: 写前端失败测试**

增加测试覆盖：按钮显示“通过并发布”；失败后当前卡片包含“处理失败”且填写内容仍在；成功响应后顶部显示“已发布为第 1 个版本，刷新客户端即可查看”。

```ts
expect(wrapper.get('[data-review-error="review-1"]').text()).toContain('处理失败');
expect(wrapper.get('[role="status"]').text()).toContain('已发布为第 1 个版本');
```

- [ ] **Step 2: 运行前端目标测试确认失败**

```powershell
npx vitest run test/web/admin.test.ts
```

Expected: FAIL，按钮文案和就地错误节点不存在。

- [ ] **Step 3: 扩展 API 响应类型**

在 `web/api.ts` 定义并校验：

```ts
export interface ReviewPublication {
  intentId: string;
  version: number;
  createdIntent: boolean;
}

export interface ReviewDecisionResult {
  item: ReviewTask;
  publication: ReviewPublication | null;
}
```

`decideReview` 返回完整结果；非通过决策允许 `publication` 为 `null`。

- [ ] **Step 4: 实现卡片内反馈**

用 `reactive<Record<string, string>>` 保存每个任务的错误。请求失败时写入当前任务；成功后清除错误、在列表顶部写成功消息并触发 `decided`。按钮标签规则为：

```ts
status === 'approved' ? '通过并发布' : status === 'rejected' ? '驳回' : '需补充'
```

将 `role="status"` 消息移到卡片列表之前，错误节点放在对应卡片按钮附近。

- [ ] **Step 5: 运行前端测试**

```powershell
npx vitest run test/web/admin.test.ts
```

Expected: 管理端目标测试全部 PASS。

- [ ] **Step 6: 提交前端修复**

```powershell
git add apps/freshman-mvp/web/api.ts `
  apps/freshman-mvp/web/components/AdminReviewQueue.vue `
  apps/freshman-mvp/test/web/admin.test.ts
git commit -m "fix: publish approved reviews from queue"
```

### Task 4: 全量回归和可部署构建

**Files:**
- Modify only if a failing regression proves a required compatibility fix.

**Interfaces:**
- Consumes: Tasks 1-3 的完整实现。
- Produces: 通过验证的 `dist/server` 和 `dist/client`。

- [ ] **Step 1: 运行全部后端测试**

```powershell
npm test
```

Expected: 全部 PASS；既有搜索、TokenDance 路由和13条队列相关测试没有回归。

- [ ] **Step 2: 运行全部前端测试**

```powershell
npm run test:web
```

Expected: 全部 PASS。

- [ ] **Step 3: 构建生产版本**

```powershell
npm run build
```

Expected: TypeScript、Vue 类型检查、Vite 构建和无 mock 数据断言全部成功。

- [ ] **Step 4: 在临时数据库执行端到端验收**

启动仅绑定 `127.0.0.1` 的临时实例，提交一个测试审核任务并执行“通过并发布”；断言 `/api/questions` 增加一条，公网保护测试仍为403。测试结束删除临时数据库，不触碰正式数据库。

- [ ] **Step 5: 记录构建指纹**

```powershell
Get-FileHash -Algorithm SHA256 dist/server/index.js,dist/server/app.js,dist/client/index.html
```

Expected: 记录三个非空 SHA-256，用于部署后比对。

### Task 5: 正式数据库备份、部署、验收和回滚

**Files:**
- Server backup: `/srv/live-in-hdu/backups/live-in-hdu-before-approved-publish-<timestamp>.db`
- Server code backup: `/srv/live-in-hdu/backups/freshman-mvp-before-approved-publish-<timestamp>.tgz`
- Deploy: `/srv/live-in-hdu/apps/freshman-mvp`

**Interfaces:**
- Consumes: Task 4 的生产构建和 SHA-256。
- Produces: 线上“通过并发布”流程及可执行回滚证据。

- [ ] **Step 1: 只读记录部署前状态**

记录 `systemctl is-active live-in-hdu`、23条公开答案、13条待审核任务和 `PRAGMA integrity_check`。

- [ ] **Step 2: 创建 SQLite 一致性备份和代码备份**

```bash
stamp=$(date +%Y%m%d-%H%M%S)
mkdir -p /srv/live-in-hdu/backups
sqlite3 /srv/live-in-hdu/apps/freshman-mvp/runtime/live-in-hdu.db \
  ".backup '/srv/live-in-hdu/backups/live-in-hdu-before-approved-publish-${stamp}.db'"
tar --exclude='freshman-mvp/runtime' --exclude='freshman-mvp/.env.local' \
  -czf "/srv/live-in-hdu/backups/freshman-mvp-before-approved-publish-${stamp}.tgz" \
  -C /srv/live-in-hdu/apps freshman-mvp
sha256sum "/srv/live-in-hdu/backups/live-in-hdu-before-approved-publish-${stamp}.db"
```

Expected: 备份文件存在，数据库备份的 `PRAGMA integrity_check` 为 `ok`。

- [ ] **Step 3: 上传并替换代码构建，不携带运行数据**

发布包只包含本次源文件、测试无关的生产源文件和 `dist`；明确排除 `.env.local`、`runtime/`、`deploy/live-in-hdu-seed.db`、`.git/`。提取后验证 `.env.local` 权限仍为600、运行数据库 SHA-256 与部署前一致。

- [ ] **Step 4: 重启并执行健康检查**

```bash
sudo systemctl restart live-in-hdu
systemctl is-active live-in-hdu
curl -fsS http://127.0.0.1:3210/api/health
```

Expected: 服务 `active`，健康响应为 `ok`。

- [ ] **Step 5: 验证权限和旧数据**

从公网确认客户端200、`/api/reviews` 仍为403；从 SSH 隧道确认管理端200、23条原有问题仍在、目标任务仍为 `pending`，其他待审核任务未丢失。

- [ ] **Step 6: 使用目标任务执行真实验收**

由用户在管理端再次审核“宿舍晚上几点熄灯？”，点击“通过并发布”。随后验证：任务状态为 `approved`；公开问题数从23增加到24；新卡片答案等于审核后答案；公网管理接口仍为403。

- [ ] **Step 7: 失败时执行回滚**

若服务、客户端、管理端、权限或数据验证任一失败：停止服务；从代码 `.tgz` 恢复原代码；仅在确认数据库已产生错误写入时，才用部署前 `.db` 恢复运行数据库；重新启动并验证23条问题、13条待审核任务和403边界。
