<script setup lang="ts">
import {
  notifications,
  dismissNotification,
  pauseNotification,
  resumeNotification,
} from "../lib/api";
import Icon from "./Icon.vue";

function resumeIfIdle(id: number, event: Event) {
  const element = event.currentTarget as HTMLElement;
  queueMicrotask(() => {
    if (!element.matches(":hover, :focus-within")) resumeNotification(id);
  });
}
</script>

<template>
  <TransitionGroup
    name="toast-flash"
    tag="div"
    class="notifications"
    aria-label="操作通知"
    aria-live="polite"
    aria-relevant="additions"
  >
    <div
      v-for="notice in notifications"
      :key="notice.id"
      class="toast"
      :class="notice.type"
      role="status"
      @mouseenter="pauseNotification(notice.id)"
      @mouseleave="resumeIfIdle(notice.id, $event)"
      @focusin="pauseNotification(notice.id)"
      @focusout="resumeIfIdle(notice.id, $event)"
    >
      <span class="toast-symbol"
        ><Icon :name="notice.type === 'error' ? 'warning' : 'check'" :size="18"
      /></span>
      <span class="toast-message">{{ notice.text }}</span>
      <button
        class="toast-close"
        aria-label="关闭通知"
        @click="dismissNotification(notice.id)"
      >
        <Icon name="close" :size="16" />
      </button>
    </div>
  </TransitionGroup>
</template>
