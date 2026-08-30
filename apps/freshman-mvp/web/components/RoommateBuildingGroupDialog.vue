<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDialogFocus } from './use-dialog-focus.js';
import type { RoommateBuildingGroup, RoommateCampusCode } from '../api.js';

const props = defineProps<{
  campus: RoommateCampusCode;
  building: string;
  status: 'loading' | 'available' | 'unavailable' | 'error';
  group: RoommateBuildingGroup | null;
}>();

const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);
const campusLabels: Record<RoommateCampusCode, string> = {
  xiasha: '下沙校区',
  shaoxing: '绍兴校区',
};
const title = computed(() => `${campusLabels[props.campus]} · ${props.building}号楼 · 新生楼栋群`);

function close(): void {
  emit('close');
}

useDialogFocus(panel, '[data-action="close-building-group"]', close);
</script>

<template>
  <div class="roommate-dialog-backdrop" role="presentation">
    <section
      ref="panel"
      class="roommate-building-group-dialog roommate-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="roommate-building-group-title"
      aria-describedby="roommate-building-group-description"
    >
      <button
        class="roommate-dialog-close"
        type="button"
        data-action="close-building-group"
        aria-label="关闭新生楼栋群二维码"
        @click="close"
      >
        ×
      </button>
      <h2 id="roommate-building-group-title">{{ title }}</h2>
      <p id="roommate-building-group-description" class="roommate-dialog-description">
        可使用微信扫描二维码加入新生楼栋群。
      </p>

      <p v-if="status === 'loading'" class="roommate-dialog-status" role="status">
        正在读取新生楼栋群…
      </p>
      <template v-else-if="status === 'available' && group?.available">
        <img class="roommate-building-group-qr" :src="group.imageUrl" alt="新生楼栋群二维码" />
      </template>
      <p v-else-if="status === 'unavailable'" class="roommate-dialog-status" role="status">
        该新生楼栋群暂未开放，不影响继续匹配。
      </p>
      <p v-else class="roommate-dialog-status" role="alert">
        新生楼栋群信息暂时无法读取，不影响继续匹配。
      </p>
    </section>
  </div>
</template>

<style scoped>
.roommate-dialog-backdrop {
  position: fixed;
  z-index: 20;
  inset: 0;
  display: grid;
  place-items: center;
  padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
  background: rgb(63 37 30 / 48%);
}

.roommate-building-group-dialog {
  position: relative;
  width: min(100%, 420px);
  max-height: min(88vh, 680px);
  overflow: auto;
  padding: 26px 20px 22px;
}

.roommate-building-group-dialog h2 {
  margin: 0 36px 12px 0;
  color: #3f251e;
  font-size: 1.25rem;
  line-height: 1.35;
}

.roommate-dialog-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  color: #68443a;
  background: #fff1dc;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
}

.roommate-dialog-description,
.roommate-dialog-status {
  color: #765b50;
  line-height: 1.65;
}

.roommate-building-group-qr {
  display: block;
  width: min(100%, 320px);
  height: auto;
  margin: 18px auto 0;
  border-radius: 12px;
}
</style>
