<script setup lang="ts">
import { computed } from 'vue';
import type { RoommateRecoveryCredential } from '../api.js';

const props = defineProps<{
  modelValue: RoommateRecoveryCredential;
  busy?: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: RoommateRecoveryCredential];
  submit: [];
  cancel: [];
}>();

const valid = computed(() => (
  Boolean(props.modelValue.registrationId.trim())
  && Boolean(props.modelValue.managementCode.trim())
));

function update(field: keyof RoommateRecoveryCredential, value: string): void {
  emit('update:modelValue', { ...props.modelValue, [field]: value });
}
</script>

<template>
  <form
    class="roommate-form roommate-panel"
    data-role="roommate-recovery-form"
    @submit.prevent="emit('submit')"
  >
    <fieldset :disabled="busy">
      <legend>恢复我的登记</legend>
      <p>请同时输入登记 ID 和创建时保存的管理码。管理码不会保存在浏览器中。</p>
      <label for="roommate-registration-id">登记 ID</label>
      <input
        id="roommate-registration-id"
        name="registrationId"
        autocomplete="off"
        required
        :value="modelValue.registrationId"
        @input="update('registrationId', ($event.target as HTMLInputElement).value)"
      />
      <label for="roommate-management-code">管理码</label>
      <input
        id="roommate-management-code"
        name="managementCode"
        type="password"
        autocomplete="off"
        required
        :value="modelValue.managementCode"
        @input="update('managementCode', ($event.target as HTMLInputElement).value)"
      />
    </fieldset>
    <button class="roommate-primary-action" type="submit" :disabled="busy || !valid">恢复登记</button>
    <button class="roommate-text-action" type="button" @click="emit('cancel')">返回新登记</button>
  </form>
</template>
