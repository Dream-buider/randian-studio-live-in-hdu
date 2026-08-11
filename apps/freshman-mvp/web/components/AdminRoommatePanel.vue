<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import {
  ApiResponseError,
  listAdminRoommates,
  moderateRoommate,
  revealRoommateContact,
  type RoommateAdminFilters,
  type RoommateAdminItem,
  type RoommateContact,
  type RoommateModerationAction,
} from '../api.js';

const filters = reactive({
  campus: '',
  status: '',
  building: '',
  orientation: '',
  room: '',
});
const items = ref<RoommateAdminItem[]>([]);
const loading = ref(true);
const errorMessage = ref('');
const reasons = reactive<Record<string, string>>({});
const rowErrors = reactive<Record<string, string>>({});
const revealedContacts = reactive<Record<string, RoommateContact>>({});
const pendingAction = ref<string | null>(null);

function statusLabel(status: RoommateAdminItem['status']): string {
  return {
    active: '有效',
    hidden: '已隐藏',
    deleted: '已删除',
    expired: '已到期',
  }[status];
}

function contactTypeLabel(type: RoommateContact['type']): string {
  return { wechat: '微信', qq: 'QQ', phone: '手机号', other: '其他' }[type];
}

function moderationActionLabel(action: NonNullable<RoommateAdminItem['lastModeration']>['action']): string {
  return {
    view_contact: '查看完整联系方式',
    hide: '隐藏',
    restore: '恢复',
    delete: '删除',
  }[action];
}

function currentFilters(): RoommateAdminFilters {
  return {
    ...(filters.campus ? { campus: filters.campus as RoommateAdminFilters['campus'] } : {}),
    ...(filters.status ? { status: filters.status as RoommateAdminFilters['status'] } : {}),
    ...(filters.building.trim() ? { building: filters.building.trim() } : {}),
    ...(filters.orientation
      ? { orientation: filters.orientation as RoommateAdminFilters['orientation'] }
      : {}),
    ...(filters.room.trim() ? { room: filters.room.trim() } : {}),
  };
}

function clearRevealedContacts(): void {
  Object.keys(revealedContacts).forEach((id) => delete revealedContacts[id]);
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  clearRevealedContacts();
  try {
    const loaded = await listAdminRoommates(currentFilters());
    items.value = [...loaded].sort((left, right) => (
      Date.parse(right.createdAt) - Date.parse(left.createdAt)
    ));
  } catch (error) {
    items.value = [];
    errorMessage.value = error instanceof ApiResponseError && error.status === 403
      ? '仅允许在本机打开'
      : '室友登记暂时加载失败，请稍后重试。';
  } finally {
    loading.value = false;
  }
}

function requireReason(item: RoommateAdminItem): string | null {
  const reason = reasons[item.id]?.trim() ?? '';
  if (!reason) {
    rowErrors[item.id] = '请先填写操作原因';
    return null;
  }
  rowErrors[item.id] = '';
  return reason;
}

async function revealContact(item: RoommateAdminItem): Promise<void> {
  const reason = requireReason(item);
  if (!reason) return;
  pendingAction.value = `reveal:${item.id}`;
  try {
    const result = await revealRoommateContact(item.id, reason);
    revealedContacts[item.id] = result.contact;
    item.lastModeration = result.lastModeration;
  } catch (error) {
    rowErrors[item.id] = error instanceof ApiResponseError && error.status === 403
      ? '仅允许在本机打开'
      : '完整联系方式读取失败，请稍后重试。';
  } finally {
    pendingAction.value = null;
  }
}

async function moderate(item: RoommateAdminItem, action: RoommateModerationAction): Promise<void> {
  const reason = requireReason(item);
  if (!reason) return;
  pendingAction.value = `${action}:${item.id}`;
  try {
    await moderateRoommate(item.id, action, reason);
    await load();
  } catch (error) {
    rowErrors[item.id] = error instanceof ApiResponseError && error.status === 403
      ? '仅允许在本机打开'
      : '操作失败，请稍后重试。';
  } finally {
    pendingAction.value = null;
  }
}

onMounted(load);
</script>

<template>
  <section class="roommate-admin" aria-labelledby="roommate-admin-heading">
    <header>
      <div>
        <p>独立于问答审核队列</p>
        <h2 id="roommate-admin-heading">室友登记管理</h2>
      </div>
      <button type="button" :disabled="loading" @click="load">刷新</button>
    </header>

    <form data-role="roommate-admin-filters" class="roommate-admin-filters" @submit.prevent="load">
      <label>
        校区
        <select v-model="filters.campus" aria-label="校区筛选">
          <option value="">全部</option>
          <option value="xiasha">下沙校区</option>
          <option value="shaoxing">绍兴校区</option>
        </select>
      </label>
      <label>
        状态
        <select v-model="filters.status" aria-label="状态筛选">
          <option value="">全部</option>
          <option value="active">有效</option>
          <option value="hidden">已隐藏</option>
          <option value="deleted">已删除</option>
          <option value="expired">已到期</option>
        </select>
      </label>
      <label>
        楼栋
        <input v-model="filters.building" aria-label="楼栋筛选" inputmode="numeric">
      </label>
      <label>
        南北
        <select v-model="filters.orientation" aria-label="南北筛选">
          <option value="">全部</option>
          <option value="south">南</option>
          <option value="north">北</option>
        </select>
      </label>
      <label>
        寝室
        <input v-model="filters.room" aria-label="寝室筛选">
      </label>
      <button type="submit" :disabled="loading">筛选</button>
    </form>

    <p v-if="loading" class="roommate-admin-state">正在读取室友登记…</p>
    <div v-else-if="errorMessage" class="roommate-admin-state" role="alert">
      <strong>{{ errorMessage }}</strong>
      <button v-if="errorMessage !== '仅允许在本机打开'" type="button" @click="load">
        重试
      </button>
    </div>
    <p v-else-if="items.length === 0" class="roommate-admin-state">当前筛选下暂无登记。</p>
    <ol v-else class="roommate-admin-list">
      <li
        v-for="item in items"
        :key="item.id"
        class="roommate-admin-row"
        data-role="roommate-admin-row"
        :data-registration-id="item.id"
      >
        <header>
          <div>
            <strong>{{ item.nickname }}</strong>
            <span>{{ statusLabel(item.status) }}</span>
          </div>
          <code>{{ item.id }}</code>
        </header>
        <p>{{ item.address.display }}</p>
        <dl>
          <div>
            <dt>联系方式</dt>
            <dd v-if="revealedContacts[item.id]" class="sensitive-contact">
              {{ contactTypeLabel(revealedContacts[item.id].type) }}：{{ revealedContacts[item.id].value }}
            </dd>
            <dd v-else-if="item.contact">
              {{ contactTypeLabel(item.contact.type) }}（已脱敏）
            </dd>
            <dd v-else>未填写</dd>
          </div>
          <div><dt>创建时间</dt><dd>{{ item.createdAt }}</dd></div>
          <div><dt>更新时间</dt><dd>{{ item.updatedAt }}</dd></div>
          <div><dt>到期时间</dt><dd>{{ item.expiresAt }}</dd></div>
        </dl>
        <p v-if="item.lastModeration">
          最近操作：{{ item.lastModeration.actorId }} ·
          {{ moderationActionLabel(item.lastModeration.action) }} ·
          {{ item.lastModeration.createdAt }} · {{ item.lastModeration.reason }}
        </p>
        <label>
          操作原因
          <input
            v-model="reasons[item.id]"
            :aria-label="`${item.id} 的操作原因`"
            placeholder="必填，写明核对或处理依据"
          >
        </label>
        <p v-if="rowErrors[item.id]" class="roommate-row-error" role="alert">
          {{ rowErrors[item.id] }}
        </p>
        <div class="roommate-admin-actions">
          <button
            v-if="item.contact"
            type="button"
            data-action="reveal-roommate-contact"
            :disabled="pendingAction !== null"
            @click="revealContact(item)"
          >
            查看完整联系方式（敏感）
          </button>
          <button
            v-if="item.status === 'active'"
            type="button"
            data-action="hide-roommate"
            :disabled="pendingAction !== null"
            @click="moderate(item, 'hide')"
          >
            隐藏
          </button>
          <button
            v-if="item.status === 'hidden'"
            type="button"
            data-action="restore-roommate"
            :disabled="pendingAction !== null"
            @click="moderate(item, 'restore')"
          >
            恢复
          </button>
          <button
            v-if="item.status === 'active' || item.status === 'hidden'"
            type="button"
            data-action="delete-roommate"
            :disabled="pendingAction !== null"
            @click="moderate(item, 'delete')"
          >
            删除
          </button>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.roommate-admin {
  display: grid;
  gap: 1rem;
  margin-block: 1.5rem;
  padding: 1.25rem;
  border: 1px solid #d6dde8;
  border-radius: 1rem;
  background: #fff;
}

.roommate-admin > header,
.roommate-admin-row > header,
.roommate-admin-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.roommate-admin h2,
.roommate-admin p {
  margin: 0;
}

.roommate-admin-filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 0.75rem;
  align-items: end;
}

.roommate-admin label,
.roommate-admin-row dl,
.roommate-admin-row dl div {
  display: grid;
  gap: 0.35rem;
}

.roommate-admin input,
.roommate-admin select,
.roommate-admin button {
  min-height: 2.75rem;
  border: 1px solid #9fb2cb;
  border-radius: 0.65rem;
  padding: 0.55rem 0.75rem;
  font: inherit;
}

.roommate-admin button {
  color: #0a416f;
  background: #f5f9fd;
  font-weight: 700;
  cursor: pointer;
}

.roommate-admin-list {
  display: grid;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.roommate-admin-row {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid #dbe3ec;
  border-radius: 0.85rem;
}

.roommate-admin-row dl {
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  margin: 0;
}

.roommate-admin-row dt {
  color: #607086;
}

.roommate-admin-row dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.sensitive-contact,
.roommate-row-error {
  color: #a12c20;
  font-weight: 700;
}

.roommate-admin-state {
  padding: 1rem;
  border-radius: 0.75rem;
  background: #f3f6fa;
}

@media (max-width: 640px) {
  .roommate-admin {
    padding: 0.9rem;
  }

  .roommate-admin-filters {
    grid-template-columns: 1fr 1fr;
  }

  .roommate-admin-actions button {
    flex: 1 1 100%;
  }
}
</style>
