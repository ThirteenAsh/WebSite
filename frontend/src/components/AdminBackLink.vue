<script setup lang="ts">
import BackArrowIcon from "./BackArrowIcon.vue";

defineProps<{ to: string; label: string }>();
</script>

<template>
  <RouterLink :to="to" class="admin-back-link">
    <span class="admin-back-icon" aria-hidden="true">
      <BackArrowIcon />
    </span>
    <span>返回{{ label }}</span>
  </RouterLink>
</template>

<style scoped>
.admin-back-link {
  display: inline-flex;
  align-items: center;
  gap: 11px;
  min-height: 40px;
  padding: 3px 0;
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  transition: color 200ms ease;
}
.admin-back-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border: 2px solid var(--ink);
  border-radius: 50%;
  background: var(--paper);
  color: var(--ink);
  box-shadow: 1px 2px 0 var(--shadow);
  transition:
    transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 280ms ease,
    background-color 200ms ease;
}
.admin-back-link:focus-visible {
  --back-arrow-fill: 1;
  outline: none;
}
.admin-back-link:focus-visible .admin-back-icon {
  outline: 3px solid var(--accent);
  outline-offset: 4px;
  transform: translateY(-3px) scale(1.08);
  box-shadow: 2px 5px 0 var(--shadow);
}
@media (hover: hover) and (pointer: fine) {
  .admin-back-link:hover {
    --back-arrow-fill: 1;
    color: var(--accent);
  }
  .admin-back-link:hover .admin-back-icon {
    background: var(--yellow);
    color: #29221d;
    transform: translateY(-3px) scale(1.08);
    box-shadow: 2px 5px 0 var(--shadow);
  }
}
.admin-back-link:active {
  --back-arrow-fill: 1;
}
.admin-back-link:active .admin-back-icon {
  transform: translateY(1px) scale(0.96);
  box-shadow: 0 1px 0 var(--shadow);
  transition-duration: 100ms;
}
@media (prefers-reduced-motion: reduce) {
  .admin-back-link,
  .admin-back-icon {
    transition: none;
  }
  .admin-back-icon {
    transform: none !important;
  }
}
</style>
