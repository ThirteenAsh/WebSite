<script setup lang="ts">
import { onMounted } from "vue";
import { notifications, ensureVisitor } from "./lib/api";
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
  <div class="notifications" aria-live="polite">
    <div v-for="n in notifications" :key="n.id" class="toast" :class="n.type">
      {{ n.text }}
    </div>
  </div>
</template>
