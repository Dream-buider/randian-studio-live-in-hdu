<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  ApiResponseError,
  createRoommateRegistration,
  deleteMyRoommateRegistration,
  getMyRoommateRegistration,
  getRoommateBuildingGroup,
  getRoommateConfig,
  listRoommateMembers,
  recoverRoommateRegistration,
  updateMyRoommateRegistration,
  type RoommateConfig,
  type RoommateMember,
  type RoommateRecoveryCredential,
  type RoommateRegistrationDraft,
  type RoommateRegistrationInput,
  type RoommateSelf,
  type RoommateBuildingGroup,
  type RoommateCampusCode,
} from '../api.js';
import BrandHeader from '../components/BrandHeader.vue';
import RoommateMemberList from '../components/RoommateMemberList.vue';
import RoommateRecoveryForm from '../components/RoommateRecoveryForm.vue';
import RoommateRegistrationForm from '../components/RoommateRegistrationForm.vue';
import RoommateBuildingGroupDialog from '../components/RoommateBuildingGroupDialog.vue';

type ViewState = 'loading' | 'disabled' | 'register' | 'confirm' | 'credential' | 'members' | 'recover' | 'error';
type ConfirmAction = 'create' | 'update';

const state = ref<ViewState>('loading');
const config = ref<RoommateConfig | null>(null);
const own = ref<RoommateSelf | null>(null);
const members = ref<RoommateMember[]>([]);
const busy = ref(false);
const errorMessage = ref('');
const errorReturnState = ref<ViewState>('register');
const confirmAction = ref<ConfirmAction>('create');
const oneTimeManagementCode = ref<string | null>(null);
const draft = ref<RoommateRegistrationDraft>(emptyRegistration());
const pendingInput = ref<RoommateRegistrationInput | null>(null);
const recoveryDraft = ref<RoommateRecoveryCredential>({ registrationId: '', managementCode: '' });
const buildingGroupDialogOpen = ref(false);
const buildingGroupStatus = ref<'loading' | 'available' | 'unavailable' | 'error'>('loading');
const buildingGroup = ref<RoommateBuildingGroup | null>(null);
const buildingGroupSelection = ref<{ campus: RoommateCampusCode; building: string } | null>(null);
let buildingGroupRequestId = 0;

let robotsMeta: HTMLMetaElement | null = null;
let previousRobotsContent: string | null = null;
let createdRobotsMeta = false;

const normalizedAddress = computed(() => {
  const building = normalizeNumeric(draft.value.address.building);
  const room = normalizeRoom(draft.value.address.room);
  const campus = config.value?.campuses.find((item) => item.code === draft.value.address.campus)?.name
    ?? '未选择校区';
  const orientationLabels: Record<string, string> = {
    east: '东', south: '南', west: '西', north: '北', unknown: '无',
  };
  const orientation = orientationLabels[draft.value.address.orientation] ?? '未选择方位';
  const bed = draft.value.address.bed === null ? null : `${draft.value.address.bed}号床`;
  return [campus, `${building}号楼`, orientation, room, bed].filter(Boolean).join(' · ');
});

function emptyRegistration(): RoommateRegistrationDraft {
  return {
    address: { campus: '', building: '', orientation: '', room: '', bed: null },
    nickname: '',
    contactType: null,
    contactValue: null,
    contacts: [],
    consent: false,
  };
}

function normalizeNumeric(value: string): string {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? String(Number(trimmed)) : trimmed.toUpperCase();
}

function normalizeRoom(value: string): string {
  const trimmed = value.trim().toUpperCase();
  return /^\d+$/.test(trimmed) ? String(Number(trimmed)) : trimmed;
}

function draftFromSelf(item: RoommateSelf): RoommateRegistrationDraft {
  return {
    address: {
      campus: item.address.campus,
      building: item.address.building,
      orientation: item.address.orientation,
      room: item.address.room,
      bed: item.address.bed,
    },
    nickname: item.nickname,
    contactType: item.contact?.type === 'other' ? 'other' : null,
    contactValue: item.contact?.type === 'other' ? item.contact.value : null,
    contacts: item.contacts.filter((contact) => contact.type !== 'other'),
    consent: item.contacts.length > 0,
  };
}

function installRobotsMeta(): void {
  robotsMeta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!robotsMeta) {
    robotsMeta = document.createElement('meta');
    robotsMeta.name = 'robots';
    document.head.append(robotsMeta);
    createdRobotsMeta = true;
  } else {
    previousRobotsContent = robotsMeta.getAttribute('content');
  }
  robotsMeta.content = 'noindex,nofollow';
}

function restoreRobotsMeta(): void {
  if (!robotsMeta) return;
  if (createdRobotsMeta) {
    robotsMeta.remove();
  } else if (previousRobotsContent === null) {
    robotsMeta.removeAttribute('content');
  } else {
    robotsMeta.content = previousRobotsContent;
  }
}

async function loadPage(): Promise<void> {
  state.value = 'loading';
  try {
    config.value = await getRoommateConfig();
    if (!config.value.enabled) {
      state.value = 'disabled';
      return;
    }
    try {
      own.value = await getMyRoommateRegistration();
    } catch (error) {
      if (error instanceof ApiResponseError && (error.status === 401 || error.status === 404)) {
        state.value = 'register';
        return;
      }
      throw error;
    }
    await showOwn(own.value);
  } catch (error) {
    showError(error, 'loading');
  }
}

async function showOwn(item: RoommateSelf): Promise<void> {
  own.value = item;
  members.value = item.status === 'hidden' ? [] : await listRoommateMembers();
  state.value = 'members';
}

function openConfirmation(input: RoommateRegistrationInput): void {
  pendingInput.value = input;
  confirmAction.value = own.value ? 'update' : 'create';
  state.value = 'confirm';
}

function editRegistration(): void {
  if (!own.value) return;
  draft.value = draftFromSelf(own.value);
  pendingInput.value = null;
  confirmAction.value = 'update';
  state.value = 'register';
}

async function submitConfirmed(): Promise<void> {
  const input = pendingInput.value;
  if (!input) {
    state.value = 'register';
    return;
  }
  busy.value = true;
  try {
    if (confirmAction.value === 'create') {
      const result = await createRoommateRegistration(input);
      own.value = result.own;
      members.value = result.members;
      oneTimeManagementCode.value = result.managementCode;
      state.value = result.managementCode ? 'credential' : 'members';
    } else {
      await showOwn(await updateMyRoommateRegistration(input));
    }
  } catch (error) {
    showError(error, 'confirm');
  } finally {
    busy.value = false;
  }
}

async function handleBuildingGroupSelected(selection: { campus: 'xiasha' | 'shaoxing'; building: string }): Promise<void> {
  const requestId = ++buildingGroupRequestId;
  buildingGroupSelection.value = selection;
  buildingGroupDialogOpen.value = true;
  buildingGroupStatus.value = 'loading';
  buildingGroup.value = null;
  try {
    const result = await getRoommateBuildingGroup(selection.campus, selection.building);
    if (requestId !== buildingGroupRequestId) return;
    buildingGroup.value = result;
    buildingGroupStatus.value = result.available ? 'available' : 'unavailable';
  } catch {
    if (requestId !== buildingGroupRequestId) return;
    buildingGroupStatus.value = 'error';
  }
}

function closeBuildingGroupDialog(): void {
  buildingGroupRequestId += 1;
  buildingGroupDialogOpen.value = false;
}

function leaveCredential(): void {
  oneTimeManagementCode.value = null;
  state.value = 'members';
}

async function deleteRegistration(): Promise<void> {
  if (!window.confirm('确定删除登记吗？删除后将立即从同寝室列表移除。')) return;
  busy.value = true;
  try {
    await deleteMyRoommateRegistration();
    own.value = null;
    members.value = [];
    oneTimeManagementCode.value = null;
    draft.value = emptyRegistration();
    pendingInput.value = null;
    state.value = 'register';
  } catch (error) {
    showError(error, 'members');
  } finally {
    busy.value = false;
  }
}

async function recoverRegistration(): Promise<void> {
  busy.value = true;
  try {
    const result = await recoverRoommateRegistration(recoveryDraft.value);
    await showOwn(result.own);
    recoveryDraft.value = { registrationId: '', managementCode: '' };
  } catch (error) {
    showError(error, 'recover');
  } finally {
    busy.value = false;
  }
}

function showError(error: unknown, returnState: ViewState): void {
  errorMessage.value = error instanceof ApiResponseError
    ? error.message
    : '请求失败，请稍后重试';
  errorReturnState.value = returnState;
  state.value = 'error';
}

function retryAfterError(): void {
  if (errorReturnState.value === 'loading') {
    void loadPage();
    return;
  }
  state.value = errorReturnState.value;
}

onMounted(() => {
  installRobotsMeta();
  void loadPage();
});

onBeforeUnmount(() => {
  buildingGroupRequestId += 1;
  oneTimeManagementCode.value = null;
  recoveryDraft.value = { registrationId: '', managementCode: '' };
  restoreRobotsMeta();
});
</script>

<template>
  <main class="roommate-page" data-theme="randian-dawn">
    <header class="roommate-page-header">
      <BrandHeader subtitle="同寝室新生自助登记" />
      <a href="/questions" class="roommate-return">返回新生问答</a>
    </header>

    <section class="roommate-intro">
      <p class="roommate-kicker">ROOMMATE SIGNAL</p>
      <h1>先找到同寝室的人</h1>
      <p>按学校短信中的寝室信息登记，只有同寝室已登记成员可查看彼此的展示信息。</p>
    </section>

    <p v-if="state === 'loading'" data-state="loading" role="status">正在连接寝室匹配服务…</p>

    <section v-else-if="state === 'disabled'" class="roommate-panel roommate-state" data-state="disabled">
      <h2>匹配室友暂未开放</h2>
      <p>我们正在完成安全连接和上线准备，完成后即可使用。现有新生问答不受影响。</p>
    </section>

    <section v-else-if="state === 'register'" data-state="register">
      <RoommateRegistrationForm
        v-if="config"
        v-model="draft"
        :campuses="config.campuses"
        :busy="busy"
        @submit="openConfirmation"
        @building-group-selected="handleBuildingGroupSelected"
        @recover="state = 'recover'"
      />
    </section>

    <section v-else-if="state === 'confirm'" class="roommate-panel roommate-confirm" data-state="confirm">
      <p>请再核对一次</p>
      <h2>{{ normalizedAddress }}</h2>
      <dl>
        <div><dt>昵称</dt><dd>{{ draft.nickname }}</dd></div>
        <div><dt>联系方式</dt><dd>{{ draft.contactValue || '未填写' }}</dd></div>
      </dl>
      <button
        class="roommate-primary-action"
        type="button"
        :data-action="confirmAction === 'create' ? 'create-registration' : 'update-registration'"
        :disabled="busy"
        @click="submitConfirmed"
      >
        {{ busy ? '正在提交…' : confirmAction === 'create' ? '确认登记' : '保存修改' }}
      </button>
      <button class="roommate-text-action" type="button" :disabled="busy" @click="state = 'register'">返回修改</button>
    </section>

    <section v-else-if="state === 'credential' && own" data-state="credential">
      <RoommateMemberList
        :own="own"
        :members="members"
        :management-code="oneTimeManagementCode"
        @credential-saved="leaveCredential"
        @edit="editRegistration"
        @delete="deleteRegistration"
      />
    </section>

    <section v-else-if="state === 'members' && own" data-state="members">
      <RoommateMemberList
        :own="own"
        :members="members"
        @edit="editRegistration"
        @delete="deleteRegistration"
      />
    </section>

    <section v-else-if="state === 'recover'" data-state="recover">
      <RoommateRecoveryForm
        v-model="recoveryDraft"
        :busy="busy"
        @submit="recoverRegistration"
        @cancel="state = 'register'"
      />
    </section>

    <section v-else-if="state === 'error'" class="roommate-panel roommate-state" data-state="error" role="alert">
      <h2>这次操作没有完成</h2>
      <p>{{ errorMessage }}</p>
      <button class="roommate-primary-action" type="button" data-action="retry-roommate-action" @click="retryAfterError">
        返回重试
      </button>
    </section>

    <RoommateBuildingGroupDialog
      v-if="buildingGroupDialogOpen && buildingGroupSelection"
      :campus="buildingGroupSelection.campus"
      :building="buildingGroupSelection.building"
      :status="buildingGroupStatus"
      :group="buildingGroup"
      @close="closeBuildingGroupDialog"
    />
  </main>
</template>
