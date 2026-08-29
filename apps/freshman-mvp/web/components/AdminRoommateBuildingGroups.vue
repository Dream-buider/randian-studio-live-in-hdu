<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  ApiResponseError,
  deleteAdminRoommateBuildingGroup,
  listAdminRoommateBuildingGroups,
  putAdminRoommateBuildingGroup,
  type AdminRoommateBuildingGroup,
  type RoommateBuildingGroupImageMime,
  type RoommateCampusCode,
} from '../api.js';

const MAX_IMAGE_SIZE = 1024 * 1024;
const items = ref<AdminRoommateBuildingGroup[]>([]);
const loading = ref(true);
const busy = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const campus = ref<RoommateCampusCode>('xiasha');
const building = ref('');
const selectedFile = ref<File | null>(null);
const imageBase64 = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
let fileReadSequence = 0;

const campusLabels: Record<RoommateCampusCode, string> = {
  xiasha: '下沙校区',
  shaoxing: '绍兴校区',
};
const selectedItem = computed(() => items.value.find((item) => (
  item.campus === campus.value && item.building === building.value
)) ?? null);

function formatSize(bytes: number): string {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${bytes} B`;
}

function safeError(error: unknown, fallback: string): string {
  return error instanceof ApiResponseError && error.status === 403
    ? '仅允许在本机打开'
    : fallback;
}

function resetFile(): void {
  fileReadSequence += 1;
  selectedFile.value = null;
  imageBase64.value = '';
  if (fileInput.value) fileInput.value.value = '';
}

function clearFeedback(): void {
  errorMessage.value = '';
  successMessage.value = '';
  resetFile();
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('read failed'));
        return;
      }
      const comma = reader.result.indexOf(',');
      const base64 = comma >= 0 ? reader.result.slice(comma + 1) : '';
      if (!base64) {
        reject(new Error('empty image'));
        return;
      }
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}

async function chooseFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  const sequence = ++fileReadSequence;
  errorMessage.value = '';
  successMessage.value = '';
  selectedFile.value = null;
  imageBase64.value = '';
  if (!file) return;
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
    errorMessage.value = '请选择 PNG 或 JPEG 图片。';
    input.value = '';
    return;
  }
  if (file.size === 0 || file.size > MAX_IMAGE_SIZE) {
    errorMessage.value = '二维码图片必须大于 0 且不超过 1 MiB。';
    input.value = '';
    return;
  }
  try {
    const base64 = await readBase64(file);
    if (sequence !== fileReadSequence) return;
    selectedFile.value = file;
    imageBase64.value = base64;
  } catch {
    if (sequence !== fileReadSequence) return;
    errorMessage.value = '图片读取失败，请重新选择。';
    input.value = '';
  }
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    items.value = (await listAdminRoommateBuildingGroups()).sort((left, right) => (
      left.campus.localeCompare(right.campus) || Number(left.building) - Number(right.building)
    ));
  } catch (error) {
    items.value = [];
    errorMessage.value = safeError(error, '楼栋群二维码暂时加载失败，请稍后重试。');
  } finally {
    loading.value = false;
  }
}

async function upload(): Promise<void> {
  if (!building.value || !selectedFile.value || !imageBase64.value) {
    errorMessage.value = '请先选择校区、楼栋和二维码图片。';
    return;
  }
  if (selectedItem.value && !window.confirm('该楼栋已有二维码，确定替换吗？')) return;
  busy.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    await putAdminRoommateBuildingGroup(campus.value, building.value, {
      mimeType: selectedFile.value.type as RoommateBuildingGroupImageMime,
      imageBase64: imageBase64.value,
    });
    await load();
    successMessage.value = `${campusLabels[campus.value]} ${building.value}号楼二维码已保存。`;
    resetFile();
  } catch (error) {
    errorMessage.value = safeError(error, '二维码保存失败，请稍后重试。');
  } finally {
    busy.value = false;
  }
}

async function remove(): Promise<void> {
  const item = selectedItem.value;
  if (!item || !window.confirm(`确定删除${campusLabels[item.campus]} ${item.building}号楼二维码吗？`)) return;
  busy.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const status = await deleteAdminRoommateBuildingGroup(item.campus, item.building);
    await load();
    successMessage.value = status === 'deleted' ? '二维码已删除。' : '该二维码已不存在。';
    resetFile();
  } catch (error) {
    errorMessage.value = safeError(error, '二维码删除失败，请稍后重试。');
  } finally {
    busy.value = false;
  }
}

function selectItem(item: AdminRoommateBuildingGroup): void {
  campus.value = item.campus;
  building.value = item.building;
  clearFeedback();
}

onMounted(load);
</script>

<template>
  <section class="building-group-admin" aria-labelledby="building-group-admin-heading">
    <header>
      <div>
        <p>仅管理员可维护，普通用户无上传入口</p>
        <h2 id="building-group-admin-heading">楼栋群二维码</h2>
      </div>
      <button type="button" :disabled="loading || busy" @click="load">刷新列表</button>
    </header>

    <div class="building-group-editor">
      <label>
        校区
        <select v-model="campus" aria-label="二维码校区" :disabled="busy" @change="clearFeedback">
          <option value="xiasha">下沙校区</option>
          <option value="shaoxing">绍兴校区</option>
        </select>
      </label>
      <label>
        楼栋
        <select v-model="building" aria-label="二维码楼栋" :disabled="busy" @change="clearFeedback">
          <option value="">请选择楼栋</option>
          <option v-for="number in 40" :key="number" :value="String(number)">{{ number }}号楼</option>
        </select>
      </label>
      <label>
        PNG/JPEG 图片（不超过 1 MiB）
        <input
          ref="fileInput"
          type="file"
          accept="image/png,image/jpeg"
          aria-label="选择楼栋群二维码图片"
          :disabled="busy"
          @change="chooseFile"
        >
      </label>
      <div class="building-group-actions">
        <button
          type="button"
          data-action="save-building-group"
          :disabled="busy || !building || !selectedFile || !imageBase64"
          @click="upload"
        >
          {{ selectedItem ? '替换二维码' : '上传二维码' }}
        </button>
        <button
          v-if="selectedItem"
          type="button"
          data-action="delete-building-group"
          :disabled="busy"
          @click="remove"
        >
          删除二维码
        </button>
      </div>
    </div>

    <p v-if="errorMessage" class="building-group-message is-error" role="alert">{{ errorMessage }}</p>
    <p v-if="successMessage" class="building-group-message is-success" role="status">{{ successMessage }}</p>

    <div v-if="selectedItem" class="building-group-preview" data-role="building-group-preview">
      <img :src="selectedItem.imageUrl" :alt="`${campusLabels[selectedItem.campus]} ${selectedItem.building}号楼群二维码`">
      <p>更新时间：{{ selectedItem.updatedAt }} · 大小：{{ formatSize(selectedItem.imageSize) }}</p>
    </div>
    <p v-else-if="building" class="building-group-message">该楼栋暂未配置二维码，可直接上传。</p>

    <p v-if="loading" class="building-group-message">正在读取二维码配置…</p>
    <p v-else-if="items.length === 0 && !errorMessage" class="building-group-message">暂未配置楼栋群二维码。</p>
    <div v-else-if="items.length > 0" class="building-group-table-wrap">
      <table>
        <thead><tr><th>校区与楼栋</th><th>更新时间</th><th>大小</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="item in items" :key="`${item.campus}:${item.building}`" data-role="building-group-row">
            <td>{{ campusLabels[item.campus] }} · {{ item.building }}号楼</td>
            <td>{{ item.updatedAt }}</td>
            <td>{{ formatSize(item.imageSize) }}</td>
            <td>
              <button type="button" data-action="select-building-group" @click="selectItem(item)">预览与管理</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.building-group-admin {
  display: grid;
  gap: 1rem;
  margin-block: 1.5rem;
  padding: 1.25rem;
  border: 1px solid #d6dde8;
  border-radius: 1rem;
  background: #fff;
}
.building-group-admin > header,
.building-group-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.building-group-admin h2,
.building-group-admin p { margin: 0; }
.building-group-editor {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: 0.75rem;
  align-items: end;
}
.building-group-admin label { display: grid; gap: 0.35rem; }
.building-group-admin input,
.building-group-admin select,
.building-group-admin button {
  min-height: 2.75rem;
  border: 1px solid #9fb2cb;
  border-radius: 0.65rem;
  padding: 0.55rem 0.75rem;
  font: inherit;
}
.building-group-admin button {
  color: #0a416f;
  background: #f5f9fd;
  font-weight: 700;
  cursor: pointer;
}
.building-group-preview {
  display: grid;
  justify-items: start;
  gap: 0.5rem;
}
.building-group-preview img {
  width: min(100%, 280px);
  height: auto;
  border-radius: 0.75rem;
}
.building-group-message { padding: 0.75rem; border-radius: 0.65rem; background: #f3f6fa; }
.building-group-message.is-error { color: #a12c20; }
.building-group-message.is-success { color: #146c43; }
.building-group-table-wrap { overflow-x: auto; }
.building-group-admin table { width: 100%; border-collapse: collapse; }
.building-group-admin th,
.building-group-admin td { padding: 0.65rem; border-bottom: 1px solid #dbe3ec; text-align: left; }
@media (max-width: 640px) {
  .building-group-admin { padding: 0.9rem; }
  .building-group-editor { grid-template-columns: 1fr; }
}
</style>
