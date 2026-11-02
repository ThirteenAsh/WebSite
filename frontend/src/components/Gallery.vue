<script setup lang="ts">
import { ref } from "vue";
import Icon from "./Icon.vue";
defineProps<{ images: string[] }>();
const dialog = ref<HTMLDialogElement>();
const selected = ref("");
function open(src: string) {
  selected.value = src;
  dialog.value?.showModal();
}
</script>
<template>
  <div
    v-if="images.length"
    class="gallery"
    :class="{ single: images.length === 1 }"
  >
    <button
      v-for="(src, i) in images"
      :key="src + i"
      class="gallery-thumb"
      @click="open(src)"
      :aria-label="`查看第 ${i + 1} 张图片`"
    >
      <img :src="src" alt="配图" loading="lazy" />
    </button>
  </div>
  <dialog ref="dialog" class="lightbox" @click="dialog?.close()">
    <button
      class="icon-btn lightbox-close"
      aria-label="关闭图片"
      @click="dialog?.close()"
    >
      <Icon name="close" /></button
    ><img v-if="selected" :src="selected" alt="配图大图" @click.stop />
  </dialog>
</template>
