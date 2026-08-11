<script setup lang="ts">
import { computed } from 'vue';
import type {
  RoommateCampusTemplate,
  RoommateContactType,
  RoommateRegistrationInput,
} from '../api.js';

const props = defineProps<{
  modelValue: RoommateRegistrationInput;
  campuses: RoommateCampusTemplate[];
  busy?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: RoommateRegistrationInput];
  submit: [];
  recover: [];
}>();

const contactEnabled = computed(() => props.modelValue.contactType !== null);
const requiresConsent = computed(() => Boolean(props.modelValue.contactValue?.trim()));
const selectedCampus = computed(() => (
  props.campuses.find((campus) => campus.code === props.modelValue.address.campus)
));
const canSubmit = computed(() => (
  selectedCampus.value?.enabled === true
  && Boolean(props.modelValue.address.building.trim())
  && Boolean(props.modelValue.address.room.trim())
  && Boolean(props.modelValue.nickname.trim())
  && (!requiresConsent.value || props.modelValue.consent)
));

function updateAddress(field: 'campus' | 'building' | 'orientation' | 'room', value: string): void {
  emit('update:modelValue', {
    ...props.modelValue,
    address: { ...props.modelValue.address, [field]: value },
  } as RoommateRegistrationInput);
}

function updateField(
  field: 'nickname' | 'contactValue',
  value: string,
): void {
  emit('update:modelValue', { ...props.modelValue, [field]: value });
}

function updateContactType(value: string): void {
  const contactType = value === '' ? null : value as RoommateContactType;
  emit('update:modelValue', {
    ...props.modelValue,
    contactType,
    contactValue: contactType === null ? null : props.modelValue.contactValue ?? '',
    consent: contactType === null ? false : props.modelValue.consent,
  });
}

function updateConsent(checked: boolean): void {
  emit('update:modelValue', { ...props.modelValue, consent: checked });
}
</script>

<template>
  <form
    class="roommate-form roommate-panel"
    data-role="roommate-registration-form"
    @submit.prevent="emit('submit')"
  >
    <fieldset :disabled="busy">
      <legend>登记寝室</legend>

      <label for="roommate-campus">校区</label>
      <select
        id="roommate-campus"
        name="campus"
        :value="modelValue.address.campus"
        @change="updateAddress('campus', ($event.target as HTMLSelectElement).value)"
      >
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
        <div>
          <label for="roommate-building">楼栋</label>
          <input
            id="roommate-building"
            name="building"
            inputmode="numeric"
            autocomplete="off"
            required
            maxlength="10"
            :value="modelValue.address.building"
            @input="updateAddress('building', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div>
          <label for="roommate-orientation">南北</label>
          <select
            id="roommate-orientation"
            name="orientation"
            :value="modelValue.address.orientation"
            @change="updateAddress('orientation', ($event.target as HTMLSelectElement).value)"
          >
            <option value="south">南</option>
            <option value="north">北</option>
          </select>
        </div>
        <div>
          <label for="roommate-room">寝室号</label>
          <input
            id="roommate-room"
            name="room"
            autocomplete="off"
            required
            maxlength="10"
            :value="modelValue.address.room"
            @input="updateAddress('room', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>

      <label for="roommate-nickname">昵称或称呼</label>
      <input
        id="roommate-nickname"
        name="nickname"
        autocomplete="nickname"
        required
        maxlength="40"
        :value="modelValue.nickname"
        @input="updateField('nickname', ($event.target as HTMLInputElement).value)"
      />

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
          maxlength="120"
          :value="modelValue.contactValue ?? ''"
          @input="updateField('contactValue', ($event.target as HTMLInputElement).value)"
        />
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
        <li>本功能由 LIVE IN HDU 团队提供，非学校官方身份认证系统。</li>
        <li>寝室与成员信息由用户自行填写，请自行判断真实性。</li>
        <li>联系方式可选；登记默认保留 90 天，期间可修改或删除。</li>
        <li>请勿填写身份证号、银行卡号、家庭住址等无关敏感信息。</li>
      </ul>
    </aside>

    <button
      class="roommate-primary-action"
      type="submit"
      data-action="confirm-registration"
      :disabled="busy || !canSubmit"
    >
      核对寝室信息
    </button>
    <button class="roommate-text-action" type="button" data-action="open-recovery" @click="emit('recover')">
      已有登记？用管理码恢复
    </button>
  </form>
</template>
