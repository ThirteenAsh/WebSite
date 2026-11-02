<script setup lang="ts">
import { ref, watch } from "vue";
import { api, ensureVisitor, notify, errorMessage } from "../lib/api";
import type { Content } from "../lib/types";
import Icon from "./Icon.vue";
const props = defineProps<{ content: Content }>();
const liked = ref(props.content.liked),
  count = ref(props.content.like_count),
  busy = ref(false);
watch(
  () => props.content,
  (c) => {
    liked.value = c.liked;
    count.value = c.like_count;
  },
);
async function toggle() {
  if (busy.value) return;
  busy.value = true;
  try {
    await ensureVisitor();
    const data = await api<{ liked: boolean; like_count: number }>(
      `/contents/${props.content.id}/like`,
      { method: "PUT", body: JSON.stringify({ liked: !liked.value }) },
    );
    liked.value = data.liked;
    count.value = data.like_count;
  } catch (e) {
    notify(errorMessage(e), "error");
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <button
    class="like-button"
    :class="{ liked }"
    :aria-pressed="liked"
    :aria-label="liked ? '取消点赞' : '点赞'"
    :disabled="busy"
    @click="toggle"
  >
    <Icon name="heart" :size="16" /><span>{{ count }}</span>
  </button>
</template>
