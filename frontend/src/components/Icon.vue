<script setup lang="ts">
defineProps<{ name: string; size?: number }>();
const paths: Record<string, string> = {
  arrow: "M7 17 17 7M7 7h10v10",
  right: "M4 12h16m-6-6 6 6-6 6",
  back: "M20 12H4m6-6-6 6 6 6",
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  moon: "M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  plus: "M12 4v16M4 12h16",
  close: "m6 6 12 12M6 18 18 6",
  book: "M4 3h12a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3V3Zm0 14h15M8 7h7m-7 4h5",
  code: "m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18",
  image:
    "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm-1 14 5-5 4 4 3-3 6 6M10 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3l-1 3-3 1-2 3 2 2-1 3 2 3 3-1 2 3h3l1-3 3-1 2-3-2-2 1-3-2-3-3 1-2-3H9",
  grid: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7",
  refresh:
    "M20 7v5h-5M4 17v-5h5M5.3 7a8 8 0 0 1 13-2L20 7M4 17l1.7 2a8 8 0 0 0 13-2",
  logout: "M9 4H4v16h5m5-13 5 5-5 5m-6-5h12",
  check: "m4 12 5 5L20 6",
  link: "m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m0-1 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
  github:
    "M9 19c-4 1-4-2-6-2m12 5v-4a3.4 3.4 0 0 0-1-2.6c3.3-.4 6.7-1.6 6.7-7.3a5.7 5.7 0 0 0-1.5-4 5.3 5.3 0 0 0-.1-4s-1.2-.4-4.1 1.5a14 14 0 0 0-7 0C5.1-.3 3.9.1 3.9.1a5.3 5.3 0 0 0-.1 4 5.7 5.7 0 0 0-1.5 4c0 5.7 3.4 6.9 6.7 7.3A3.4 3.4 0 0 0 8 18v4",
  menu: "M4 6h16M4 12h16M4 18h16",
  edit: "m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14v6Z",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
};
</script>
<template>
  <svg
    :width="size || 19"
    :height="size || 19"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.code" />
  </svg>
</template>
