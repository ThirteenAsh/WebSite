<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { activeDialog, settleDialog, showError } from "../lib/dialogs";
import Icon from "./Icon.vue";

const dialog = ref<HTMLDialogElement>();
const visible = ref(false);
let accepted = false;
let previousFocus: HTMLElement | null = null;
let previousOverflow = "";
let validationPending = false;

watch(
  activeDialog,
  async (request) => {
    if (!request) return;
    accepted = false;
    previousFocus = request.trigger;
    previousOverflow = document.documentElement.style.overflow;
    visible.value = true;
    await nextTick();
    document.documentElement.style.overflow = "hidden";
    dialog.value?.showModal();
  },
  { immediate: true },
);

function finish(result: boolean) {
  if (!visible.value) return;
  accepted = result;
  visible.value = false;
}
function afterClose(element: Element) {
  (element as HTMLDialogElement).close();
  document.documentElement.style.overflow = previousOverflow;
  const target = previousFocus;
  const focusAfterClose = document.activeElement;
  settleDialog(accepted);
  requestAnimationFrame(() => {
    if (
      !activeDialog.value &&
      target?.isConnected &&
      document.activeElement === focusAfterClose
    )
      target.focus({ preventScroll: true });
  });
}
function backdrop(event: MouseEvent) {
  if (event.target !== dialog.value) return;
  const rect = dialog.value.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    finish(false);
}

// 由同一套弹窗呈现后台表单的浏览器校验信息，每次提交只提示首个错误。
function invalid(event: Event) {
  const input = event.target;
  if (
    !(
      input instanceof HTMLInputElement ||
      input instanceof HTMLTextAreaElement ||
      input instanceof HTMLSelectElement
    ) ||
    !input.closest(".admin-shell, .login-page")
  )
    return;
  event.preventDefault();
  if (validationPending) return;
  validationPending = true;
  window.setTimeout(() => {
    validationPending = false;
  }, 0);
  const label =
    input.labels?.[0]?.textContent?.trim().replace(/\s+/g, " ") || "此项";
  const message = input.validity.valueMissing
    ? `请填写${label}。`
    : input.validity.tooShort && "minLength" in input
      ? `${label}至少需要 ${input.minLength} 个字符。`
      : `${label}的填写内容不符合要求，请检查格式或取值范围。`;
  void showError(message, "请检查填写内容").then(() => {
    if (input.isConnected) input.focus();
  });
}
onMounted(() => document.addEventListener("invalid", invalid, true));
onBeforeUnmount(() => {
  document.removeEventListener("invalid", invalid, true);
  if (dialog.value?.open) {
    dialog.value.close();
    document.documentElement.style.overflow = previousOverflow;
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="feedback-dialog" @after-leave="afterClose">
      <dialog
        v-if="visible && activeDialog"
        ref="dialog"
        class="feedback-dialog"
        :class="activeDialog.tone || 'info'"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="`feedback-title-${activeDialog.id}`"
        :aria-describedby="`feedback-message-${activeDialog.id}`"
        @cancel.prevent="finish(false)"
        @click="backdrop"
      >
        <button
          class="icon-btn feedback-close"
          aria-label="关闭提示弹窗"
          @click="finish(false)"
        >
          <Icon name="close" :size="18" />
        </button>
        <span class="feedback-symbol">
          <Icon
            :name="
              activeDialog.tone === 'danger'
                ? 'trash'
                : activeDialog.tone === 'info'
                  ? 'info'
                  : 'warning'
            "
            :size="25"
          />
        </span>
        <p class="eyebrow">A LITTLE REMINDER</p>
        <h2 :id="`feedback-title-${activeDialog.id}`">
          {{ activeDialog.title }}<span class="heading-dot">.</span>
        </h2>
        <p :id="`feedback-message-${activeDialog.id}`" class="feedback-message">
          {{ activeDialog.message }}
        </p>
        <div class="feedback-actions">
          <button
            v-if="activeDialog.cancelText"
            class="btn secondary"
            autofocus
            @click="finish(false)"
          >
            {{ activeDialog.cancelText }}
          </button>
          <button
            class="btn"
            :class="activeDialog.tone === 'danger' ? 'danger' : 'primary'"
            :autofocus="!activeDialog.cancelText"
            @click="finish(true)"
          >
            {{ activeDialog.confirmText || "确定"
            }}<Icon name="right" :size="17" />
          </button>
        </div>
      </dialog>
    </Transition>
  </Teleport>
</template>
