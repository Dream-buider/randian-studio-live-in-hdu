<script setup lang="ts">
import { computed, ref } from 'vue';
import type {
  RoommateCampusTemplate,
  RoommateContactType,
  RoommateRegistrationDraft,
  RoommateRegistrationInput,
  RoommateBed,
  RoommateCampusCode,
  RoommateOrientation,
} from '../api.js';

const props = defineProps<{
  modelValue: RoommateRegistrationDraft;
  campuses: RoommateCampusTemplate[];
  busy?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: RoommateRegistrationDraft];
  'building-group-selected': [selection: { campus: RoommateCampusCode; building: string }];
  submit: [value: RoommateRegistrationInput];
  recover: [];
}>();

const validationAttempted = ref(false);
const contactEnabled = computed(() => props.modelValue.contactType !== null);
const requiresConsent = computed(() => Boolean(props.modelValue.contactValue?.trim()));
const selectedCampus = computed(() => (
  props.campuses.find((campus) => campus.code === props.modelValue.address.campus)
));
const buildingValid = computed(() => {
  const value = props.modelValue.address.building.trim();
  return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 40;
});
const orientationValid = computed(() => (
  ['east', 'south', 'west', 'north', 'unknown'].includes(props.modelValue.address.orientation)
));
const roomValid = computed(() => /^[A-Za-z0-9]{1,10}$/.test(props.modelValue.address.room.trim()));
const nicknameValid = computed(() => {
  const value = props.modelValue.nickname.trim();
  return value.length > 0 && Array.from(value).length <= 30;
});
const contactValid = computed(() => {
  if (!contactEnabled.value) return true;
  const value = props.modelValue.contactValue?.trim() ?? '';
  return value.length > 0 && Array.from(value).length <= 100 && props.modelValue.consent;
});
const canSubmit = computed(() => (
  selectedCampus.value?.enabled === true
  && buildingValid.value
  && orientationValid.value
  && roomValid.value
  && nicknameValid.value
  && contactValid.value
));

function submitIfValid(): void {
  validationAttempted.value = true;
  if (canSubmit.value) {
    const campus = props.modelValue.address.campus;
    const orientation = props.modelValue.address.orientation;
    if (!isCampusCode(campus) || !isRoommateOrientation(orientation)) return;
    const input: RoommateRegistrationInput = {
      address: {
        campus,
        building: props.modelValue.address.building,
        orientation,
        room: props.modelValue.address.room,
        bed: props.modelValue.address.bed,
      },
      nickname: props.modelValue.nickname,
      contactType: props.modelValue.contactType,
      contactValue: props.modelValue.contactValue,
      consent: props.modelValue.consent,
    };
    emit('submit', input);
  }
}

function isCampusCode(value: string): value is RoommateCampusCode {
  return value === 'xiasha' || value === 'shaoxing';
}

function isRoommateOrientation(value: string): value is RoommateOrientation {
  return ['east', 'south', 'west', 'north', 'unknown'].includes(value);
}

function isRoommateBed(value: string): value is RoommateBed {
  return ['1', '2', '3', '4', '5'].includes(value);
}

function updateAddress(field: 'orientation' | 'room', value: string): void {
  emit('update:modelValue', {
    ...props.modelValue,
    address: { ...props.modelValue.address, [field]: value },
  });
}

function updateCampus(value: string): void {
  emit('update:modelValue', {
    ...props.modelValue,
    address: { ...props.modelValue.address, campus: isCampusCode(value) ? value : '', building: '' },
  });
}

function updateBuilding(value: string): void {
  emit('update:modelValue', {
    ...props.modelValue,
    address: { ...props.modelValue.address, building: value },
  });
  if (isCampusCode(props.modelValue.address.campus) && /^\d+$/.test(value)) {
    emit('building-group-selected', {
      campus: props.modelValue.address.campus,
      building: String(Number(value)),
    });
  }
}

function updateBed(value: string): void {
  const bed: RoommateBed | null = isRoommateBed(value) ? value : null;
  emit('update:modelValue', { ...props.modelValue, address: { ...props.modelValue.address, bed } });
}

function updateField(
  field: 'nickname' | 'contactValue',
  value: string,
): void {
  emit('update:modelValue', { ...props.modelValue, [field]: value });
}

function updateContactType(value: string): void {
  const contactType: RoommateContactType | null = isRoommateContactType(value) ? value : null;
  emit('update:modelValue', {
    ...props.modelValue,
    contactType,
    contactValue: contactType === null ? null : props.modelValue.contactValue ?? '',
    consent: contactType === null ? false : props.modelValue.consent,
  });
}

function isRoommateContactType(value: string): value is RoommateContactType {
  return ['wechat', 'qq', 'phone', 'other'].includes(value);
}

function updateConsent(checked: boolean): void {
  emit('update:modelValue', { ...props.modelValue, consent: checked });
}
</script>

<template>
  <form
    class="roommate-form roommate-panel"
    data-role="roommate-registration-form"
    novalidate
    @submit.prevent="submitIfValid"
  >
    <fieldset :disabled="busy">
      <legend>登记寝室</legend>

      <label for="roommate-campus">校区</label>
      <select
        id="roommate-campus"
        name="campus"
        :value="modelValue.address.campus"
        required
        :aria-invalid="validationAttempted && !selectedCampus"
        @change="updateCampus(($event.target as HTMLSelectElement).value)"
      >
        <option value="">请选择校区</option>
        <option v-for="campus in campuses" :key="campus.code" :value="campus.code">
          {{ campus.name }}<template v-if="!campus.enabled">（暂未开放）</template>
        </option>
      </select>

      <p
        v-if="selectedCampus && !selectedCampus.enabled"
        id="roommate-campus-unavailable"
        class="roommate-notice"
        role="status"
      >
        {{ selectedCampus.unavailableReason }}
      </p>

      <div class="roommate-address-grid">
        <div class="roommate-address-field">
          <label for="roommate-building">楼栋</label>
          <select
            id="roommate-building"
            name="building"
            required
            aria-describedby="roommate-building-message"
            :aria-invalid="validationAttempted && !buildingValid"
            :disabled="!modelValue.address.campus"
            :value="modelValue.address.building"
            @change="updateBuilding(($event.target as HTMLSelectElement).value)"
          >
            <option value="">请选择楼栋</option>
            <option v-for="building in 40" :key="building" :value="String(building)">
              {{ building }}号楼
            </option>
          </select>
          <p
            id="roommate-building-message"
            class="roommate-field-message"
            :class="{ 'is-error': validationAttempted && !buildingValid }"
          >
            {{ validationAttempted && !buildingValid ? '请选择1–40号楼栋' : '请选择楼栋' }}
          </p>
        </div>
        <div class="roommate-address-field">
          <label for="roommate-orientation">方位</label>
          <select
            id="roommate-orientation"
            name="orientation"
            required
            aria-describedby="roommate-orientation-message"
            :value="modelValue.address.orientation"
            :aria-invalid="validationAttempted && !orientationValid"
            @change="updateAddress('orientation', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">请选择方位</option>
            <option value="east">东</option>
            <option value="south">南</option>
            <option value="west">西</option>
            <option value="north">北</option>
            <option value="unknown">不确定</option>
          </select>
          <p
            id="roommate-orientation-message"
            class="roommate-field-message"
            :class="{ 'is-error': validationAttempted && !orientationValid }"
          >
            {{ validationAttempted && !orientationValid ? '请选择方位' : '不确定时可选择“不确定”' }}
          </p>
        </div>
        <div class="roommate-address-field">
          <label for="roommate-room">寝室号</label>
          <input
            id="roommate-room"
            name="room"
            autocomplete="off"
            required
            maxlength="10"
            aria-describedby="roommate-room-message"
            :aria-invalid="validationAttempted && !roomValid"
            :value="modelValue.address.room"
            @input="updateAddress('room', ($event.target as HTMLInputElement).value)"
          />
          <p
            id="roommate-room-message"
            class="roommate-field-message"
            :class="{ 'is-error': validationAttempted && !roomValid }"
          >
            {{ validationAttempted && !roomValid ? '请输入 1–10 位数字或字母' : '例如：207' }}
          </p>
        </div>
        <div class="roommate-address-field">
          <label for="roommate-bed">床位（可选）</label>
          <select
            id="roommate-bed"
            name="bed"
            aria-describedby="roommate-bed-message"
            :value="modelValue.address.bed ?? ''"
            @change="updateBed(($event.target as HTMLSelectElement).value)"
          >
            <option value="">不填写床位</option>
            <option value="1">1号床</option>
            <option value="2">2号床</option>
            <option value="3">3号床</option>
            <option value="4">4号床</option>
            <option value="5">五号床</option>
          </select>
          <p id="roommate-bed-message" class="roommate-field-message">选填，不影响同寝室匹配</p>
        </div>
      </div>

      <label for="roommate-nickname">昵称或称呼</label>
      <input
        id="roommate-nickname"
        name="nickname"
        autocomplete="nickname"
        required
        maxlength="30"
        aria-describedby="roommate-nickname-message"
        :aria-invalid="validationAttempted && !nicknameValid"
        :value="modelValue.nickname"
        @input="updateField('nickname', ($event.target as HTMLInputElement).value)"
      />
      <p
        id="roommate-nickname-message"
        class="roommate-field-message"
        :class="{ 'is-error': validationAttempted && !nicknameValid }"
      >
        {{ validationAttempted && !nicknameValid ? '请输入 1–30 个字符的昵称' : '同寝室成员会看到这个昵称' }}
      </p>

      <label for="roommate-contact-type">联系方式类型（可选）</label>
      <select
        id="roommate-contact-type"
        name="contactType"
        :value="modelValue.contactType ?? ''"
        @change="updateContactType(($event.target as HTMLSelectElement).value)"
      >
        <option value="">不填写联系方式</option>
        <option value="wechat">微信</option>
        <option value="qq">QQ</option>
        <option value="phone">手机号</option>
        <option value="other">其他</option>
      </select>

      <template v-if="contactEnabled">
        <label for="roommate-contact-value">联系方式</label>
        <input
          id="roommate-contact-value"
          name="contactValue"
          autocomplete="off"
          required
          maxlength="100"
          aria-describedby="roommate-contact-message"
          :aria-invalid="validationAttempted && !contactValid"
          :value="modelValue.contactValue ?? ''"
          @input="updateField('contactValue', ($event.target as HTMLInputElement).value)"
        />
        <p
          id="roommate-contact-message"
          class="roommate-field-message"
          :class="{ 'is-error': validationAttempted && !contactValid }"
        >
          {{ validationAttempted && !contactValid
            ? '选择类型后请填写联系方式，并同意展示'
            : '最多 100 个字符，仅同寝室已登记成员可见' }}
        </p>
        <label v-if="requiresConsent" class="roommate-consent">
          <input
            name="consent"
            type="checkbox"
            required
            :checked="modelValue.consent"
            @change="updateConsent(($event.target as HTMLInputElement).checked)"
          />
          <span>我同意将该联系方式展示给同寝室已登记成员</span>
        </label>
      </template>
    </fieldset>

    <aside class="roommate-privacy-copy" aria-label="隐私提示">
      <strong>提交前请留意</strong>
      <ul>
        <li>有任何技术上的问题请咨询：微信：lbz070605</li>
        <li>如果新生楼栋群已满，请加团队负责人微信：Vikboow，通过管理员添加入群聊。</li>
        <li>寝室与成员信息由用户自行填写，请自行判断真实性。</li>
        <li>联系方式可选；登记默认保留 90 天，期间可修改或删除。</li>
        <li>请勿填写身份证号、银行卡号、家庭住址等无关敏感信息。</li>
      </ul>
    </aside>

    <button
      class="roommate-primary-action"
      type="submit"
      data-action="confirm-registration"
      :disabled="busy || selectedCampus?.enabled !== true"
    >
      核对寝室信息
    </button>
    <button class="roommate-text-action" type="button" data-action="open-recovery" @click="emit('recover')">
      已有登记？用管理码恢复
    </button>
  </form>
</template>
