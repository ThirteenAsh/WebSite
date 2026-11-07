<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import Icon from "./Icon.vue";
import RoundedCloseIcon from "./RoundedCloseIcon.vue";
import PictureStickerIcon from "./PictureStickerIcon.vue";

const props = defineProps<{ images: string[]; originalLink?: boolean }>();
const dialog = ref<HTMLDialogElement>();
const visible = ref(false);
const current = ref(0);
const failed = ref(false);
const selected = computed(() => props.images[current.value]);
let previousFocus: HTMLElement | null = null;
let previousOverflow = "";
let locked = false;

async function open(index = 0, trigger?: HTMLElement) {
  if (!props.images.length || visible.value) return;
  current.value = Math.max(0, Math.min(index, props.images.length - 1));
  failed.value = false;
  previousFocus = trigger || (document.activeElement as HTMLElement | null);
  visible.value = true;
  await nextTick();
  if (!dialog.value) return;
  previousOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";
  locked = true;
  dialog.value.showModal();
}
function close() {
  visible.value = false;
}
function release() {
  if (!locked) return;
  document.documentElement.style.overflow = previousOverflow;
  locked = false;
}
function afterClose(element: Element) {
  (element as HTMLDialogElement).close();
  release();
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
}
function backdrop(event: MouseEvent) {
  if (event.target !== dialog.value || !dialog.value) return;
  const bounds = dialog.value.getBoundingClientRect();
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  )
    close();
}
function step(direction: number) {
  current.value = Math.max(
    0,
    Math.min(current.value + direction, props.images.length - 1),
  );
}
watch(selected, () => {
  failed.value = false;
});
watch(
  () => props.images.length,
  (length) => {
    if (!length) close();
    else current.value = Math.min(current.value, length - 1);
  },
);
onBeforeUnmount(() => {
  dialog.value?.close();
  release();
});
defineExpose({ open });
</script>

<template>
  <Teleport to="body">
    <Transition name="image-viewer" @after-leave="afterClose">
      <dialog
        v-if="visible"
        ref="dialog"
        class="lightbox image-viewer"
        aria-label="图片预览"
        @cancel.prevent="close"
        @click="backdrop"
        @keydown.left.prevent="step(-1)"
        @keydown.right.prevent="step(1)"
      >
        <header class="image-viewer-header">
          <h2><PictureStickerIcon /></h2>
          <button
            type="button"
            class="image-viewer-button image-viewer-close"
            aria-label="关闭图片"
            autofocus
            @click="close"
          >
            <RoundedCloseIcon />
          </button>
        </header>
        <div class="image-viewer-stage">
          <img
            v-if="selected && !failed"
            :key="selected"
            class="image-viewer-image"
            :src="selected"
            alt="配图大图"
            @error="failed = true"
          />
          <p v-else class="image-viewer-error">
            <Icon name="image" :size="28" />图片暂时无法加载
          </p>
        </div>
        <footer class="image-viewer-footer">
          <a
            v-if="originalLink && selected && !failed"
            class="text-link"
            :href="selected"
            target="_blank"
            rel="noopener noreferrer"
            >打开原图</a
          >
          <span v-else class="image-viewer-hint">点击空白处关闭</span>
          <div class="image-viewer-navigation">
            <button
              v-if="images.length > 1"
              type="button"
              class="image-viewer-button"
              aria-label="上一张图片"
              :disabled="current === 0"
              @click="step(-1)"
            >
              <Icon name="back" :size="17" />
            </button>
            <span class="image-viewer-count" aria-live="polite"
              >{{ current + 1 }} / {{ images.length }}</span
            >
            <button
              v-if="images.length > 1"
              type="button"
              class="image-viewer-button"
              aria-label="下一张图片"
              :disabled="current === images.length - 1"
              @click="step(1)"
            >
              <Icon name="right" :size="17" />
            </button>
          </div>
        </footer>
      </dialog>
    </Transition>
  </Teleport>
</template>

<style scoped>
.image-viewer {
  width: fit-content;
  min-width: min(360px, calc(100% - 32px));
  max-width: min(900px, calc(100% - 64px));
  max-height: calc(100svh - 64px);
  padding: 0;
  margin: auto;
  overflow: hidden;
  background: var(--paper);
  color: var(--ink);
  border: 2px solid var(--ink);
  border-radius: 15px;
  box-shadow: 6px 8px 0 var(--shadow);
}
.image-viewer::backdrop {
  background: #29221d80;
  backdrop-filter: blur(3px);
}
.image-viewer-header,
.image-viewer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 14px 18px;
}
.image-viewer-header h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 750;
}
.image-viewer-header .heading-dot {
  margin-left: -8px;
}
.image-viewer-stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  place-items: center;
  min-width: 0;
  min-height: 140px;
  padding: 18px;
  border-block: 1px solid var(--line);
  background: var(--code);
}
.image-viewer-image {
  display: block;
  width: auto;
  height: auto;
  max-width: min(760px, 100%);
  max-height: min(58svh, 560px, calc(100svh - 240px));
  object-fit: contain;
  border-radius: 7px;
}
.image-viewer-footer {
  padding-block: 12px;
}
.image-viewer-hint,
.image-viewer-count {
  color: var(--muted);
  font-size: 12px;
}
.image-viewer-count {
  min-width: 38px;
  text-align: center;
  font-family: ui-monospace, Consolas, monospace;
}
.image-viewer-navigation {
  display: flex;
  align-items: center;
  gap: 9px;
}
.image-viewer-button {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1.5px solid var(--ink);
  border-radius: 50%;
  background: var(--paper);
  color: var(--ink);
  box-shadow: 1px 2px 0 var(--shadow);
  transition:
    background-color 180ms ease,
    transform 180ms ease,
    box-shadow 180ms ease;
}
.image-viewer-button:not(:disabled):hover {
  background: var(--yellow);
  transform: translateY(-1px);
}
.image-viewer-button:not(:disabled):active {
  transform: translateY(1px);
  box-shadow: none;
}
.image-viewer-button:disabled {
  cursor: default;
  opacity: 0.35;
  box-shadow: none;
}
.image-viewer-error {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 20px;
  color: var(--muted);
  font-size: 14px;
}
.image-viewer-enter-active {
  animation: image-viewer-arrive 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.image-viewer-leave-active {
  animation: image-viewer-depart 140ms ease-in both;
}
.image-viewer-enter-active::backdrop {
  animation: image-viewer-arrive-backdrop 180ms ease-out both;
}
.image-viewer-leave-active::backdrop {
  animation: image-viewer-arrive-backdrop 140ms ease-in reverse both;
}
@keyframes image-viewer-arrive {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@keyframes image-viewer-depart {
  to {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
}
@keyframes image-viewer-arrive-backdrop {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@media (max-width: 700px), (max-height: 500px) {
  .image-viewer {
    max-width: calc(100% - 32px);
    max-height: calc(100svh - 32px);
    border-radius: 12px;
    box-shadow: 3px 4px 0 var(--shadow);
  }
  .image-viewer-header,
  .image-viewer-footer {
    padding: 12px;
    gap: 12px;
  }
  .image-viewer-stage {
    padding: 12px;
    min-height: 80px;
  }
  .image-viewer-image {
    max-width: 100%;
    max-height: min(56svh, calc(100svh - 192px));
  }
  .image-viewer-hint {
    font-size: 11px;
  }
}
</style>
