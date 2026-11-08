<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { renderMarkdown } from "../lib/markdown";
import ImageViewer from "./ImageViewer.vue";

const props = defineProps<{ source: string; previewImages?: boolean }>();
const html = computed(() => renderMarkdown(props.source));
const body = ref<HTMLElement>();
const viewer = ref<InstanceType<typeof ImageViewer>>();
const images = ref<string[]>([]);
let targets: HTMLImageElement[] = [];

watch(
  [html, body],
  () => {
    images.value = [];
    targets =
      props.previewImages && body.value
        ? Array.from(body.value.querySelectorAll("img")).filter(
            (img) =>
              (img.currentSrc || img.getAttribute("src")?.trim()) &&
              !img.closest("a"),
          )
        : [];
    for (const [index, img] of targets.entries()) {
      img.classList.add("markdown-image-preview");
      img.tabIndex = 0;
      img.setAttribute("role", "button");
      img.setAttribute(
        "aria-label",
        img.alt.trim() ? `查看图片：${img.alt}` : `查看第 ${index + 1} 张图片`,
      );
    }
  },
  { flush: "post" },
);

async function openImage(event: MouseEvent | KeyboardEvent) {
  const img = event.target;
  if (!(img instanceof HTMLImageElement)) return;
  const index = targets.indexOf(img);
  if (index === -1) return;
  event.preventDefault();
  images.value = targets.map((target) => target.currentSrc || target.src);
  await nextTick();
  if (targets[index] === img) void viewer.value?.open(index, img);
}
</script>

<template>
  <div
    :key="String(previewImages)"
    ref="body"
    class="markdown"
    @click="openImage"
    @keydown.enter.space="openImage"
    v-html="html"
  />
  <ImageViewer v-if="previewImages" ref="viewer" :images="images" />
</template>

<style scoped>
.markdown :deep(.markdown-image-preview) {
  cursor: zoom-in;
}
.markdown :deep(.markdown-image-preview:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
</style>
