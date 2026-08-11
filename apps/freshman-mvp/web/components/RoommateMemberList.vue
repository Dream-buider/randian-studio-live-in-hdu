<script setup lang="ts">
import { ref } from 'vue';
import type { RoommateMember, RoommateSelf } from '../api.js';

const props = defineProps<{
  own: RoommateSelf;
  members: RoommateMember[];
  managementCode?: string | null;
}>();
const emit = defineEmits<{
  edit: [];
  delete: [];
  'credential-saved': [];
}>();

const copied = ref(false);
const contactLabels: Record<string, string> = {
  wechat: '微信',
  qq: 'QQ',
  phone: '手机号',
  other: '其他',
};

async function copyCredential(): Promise<void> {
  if (!props.managementCode) return;
  try {
    await navigator.clipboard?.writeText(
      `登记 ID：${props.own.id}\n管理码：${props.managementCode}`,
    );
    copied.value = true;
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <section class="roommate-members roommate-panel" aria-labelledby="roommate-members-title">
    <div class="roommate-section-heading">
      <div>
        <p>当前寝室</p>
        <h1 id="roommate-members-title">{{ own.address.display }}</h1>
      </div>
      <span>{{ members.length }} 人已登记</span>
    </div>

    <aside v-if="managementCode" class="roommate-credential" aria-labelledby="roommate-credential-title">
      <h2 id="roommate-credential-title">请立即保存恢复凭证</h2>
      <p>管理码只显示这一次，离开后无法再查看。</p>
      <dl>
        <div><dt>登记 ID</dt><dd>{{ own.id }}</dd></div>
        <div><dt>管理码</dt><dd>{{ managementCode }}</dd></div>
      </dl>
      <button type="button" data-action="copy-credential" @click="copyCredential">
        {{ copied ? '已复制' : '复制完整凭证' }}
      </button>
      <button type="button" data-action="credential-saved" @click="emit('credential-saved')">
        我已保存，进入成员列表
      </button>
    </aside>

    <ul class="roommate-member-grid" aria-label="同寝室已登记成员">
      <li v-for="member in members" :key="member.id">
        <strong>{{ member.nickname }}<span v-if="member.id === own.id">（我）</span></strong>
        <p v-if="member.contact">
          {{ contactLabels[member.contact.type] ?? '联系方式' }}：{{ member.contact.value }}
        </p>
        <p v-else>暂未留下联系方式</p>
      </li>
    </ul>

    <div class="roommate-member-actions">
      <button type="button" data-action="edit-registration" @click="emit('edit')">修改我的信息</button>
      <button class="roommate-danger-action" type="button" data-action="delete-registration" @click="emit('delete')">
        删除我的登记
      </button>
    </div>
  </section>
</template>
