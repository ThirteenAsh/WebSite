<script setup lang="ts">
import { onMounted } from "vue";
import { ensureVisitor } from "./lib/api";
import FeedbackDialog from "./components/FeedbackDialog.vue";
import NotificationStack from "./components/NotificationStack.vue";
onMounted(() => {
  ensureVisitor().catch(() => {});
});
</script>
<template>
  <RouterView v-slot="{ Component, route }">
    <Transition name="page" mode="out-in"
      ><div :key="route.matched[0]?.path || route.path" class="app-page">
        <component :is="Component" /></div
    ></Transition>
  </RouterView>
  <NotificationStack />
  <FeedbackDialog />
</template>
