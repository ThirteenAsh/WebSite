<script setup lang="ts">
import { ref } from "vue";
import MediaPicker from "./MediaPicker.vue";
import Icon from "./Icon.vue";
defineProps<{ modelValue: string; label: string }>();
defineEmits<{ "update:modelValue": [value: string] }>();
const picker = ref<InstanceType<typeof MediaPicker>>();
</script>
<template>
  <div class="image-field">
    <span class="field-label">{{ label }}</span>
    <div v-if="modelValue" class="image-field-preview">
      <img :src="modelValue" :alt="label" /><button
        class="icon-btn"
        :aria-label="`移除${label}`"
        @click="$emit('update:modelValue', '')"
      >
        <Icon name="close" :size="16" />
      </button>
    </div>
    <button class="image-field-add" @click="picker?.open()">
      <Icon name="image" />{{
        modelValue ? "更换图片" : `选择${label}`
      }}</button
    ><MediaPicker
      ref="picker"
      @select="(url) => $emit('update:modelValue', url)"
    />
  </div>
</template>
