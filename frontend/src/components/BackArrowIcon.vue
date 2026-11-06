<template>
  <svg
    class="back-arrow"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M10.1 4.1C8.2 4.9 5.5 7.6 3.6 10.7c-.5.8-.5 1.8 0 2.6 1.9 3.1 4.6 5.8 6.5 6.6.6.3 1.2-.1 1.2-.8l-.25-3.1c3.05.5 6.35.8 8.95.4 1.2-2.2 1.2-6.6 0-8.8-2.6-.4-5.9-.1-8.95.4l.25-3.1c0-.7-.6-1.1-1.2-.8Z"
    />
  </svg>
</template>

<style scoped>
.back-arrow {
  fill: var(--accent);
  fill-opacity: var(--back-arrow-fill, 0);
  stroke: var(--accent);
  stroke-width: 1.6;
  stroke-linejoin: round;
  transition: fill-opacity 180ms ease;
}
@media (prefers-reduced-motion: reduce) {
  .back-arrow {
    transition: none;
  }
}
</style>
