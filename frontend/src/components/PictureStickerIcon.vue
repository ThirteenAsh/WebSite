<template>
  <span class="picture-sticker" aria-hidden="true">
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
    >
      <rect x="3.5" y="4" width="17" height="16" rx="3" />
      <circle cx="15.5" cy="8.5" r="1.4" />
      <path
        d="m4 16 4.2-4.2a1.1 1.1 0 0 1 1.6 0l3.2 3.3 1.4-1.4a1.1 1.1 0 0 1 1.6 0l4 4.3"
      />
    </svg>
  </span>
</template>

<style scoped>
.picture-sticker {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  margin-right: 2px;
  border: 1.3px solid var(--ink);
  border-radius: 9px;
  background: var(--yellow);
  color: var(--ink);
  box-shadow: 2px 3px 0 var(--shadow);
  transform: rotate(-7deg);
}
</style>
