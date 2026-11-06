<script setup lang="ts">
import { ref } from "vue";
import ImageViewer from "./ImageViewer.vue";
defineProps<{ images: string[]; compact?: boolean }>();
const viewer = ref<InstanceType<typeof ImageViewer>>();
function open(index: number, event: MouseEvent) {
  void viewer.value?.open(index, event.currentTarget as HTMLElement);
}
</script>
<template>
  <div
    v-if="images.length"
    class="gallery"
    :class="{
      single: images.length === 1,
      'gallery-compact': compact,
      'gallery-four': compact && images.length === 4,
    }"
  >
    <button
      v-for="(src, i) in images"
      :key="src + i"
      class="gallery-thumb"
      @click="open(i, $event)"
      :aria-label="`查看第 ${i + 1} 张图片`"
    >
      <img :src="src" alt="配图" loading="lazy" />
    </button>
  </div>
  <ImageViewer ref="viewer" :images="images" />
</template>
<style scoped>
.gallery-compact {
  max-width: 420px;
  gap: 5px;
  margin-top: 14px;
}
.gallery-compact.gallery-four {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  max-width: 280px;
}
.gallery-compact.single {
  max-width: 320px;
}
.gallery-compact .gallery-thumb {
  border: 0;
  border-radius: 3px;
}
</style>
