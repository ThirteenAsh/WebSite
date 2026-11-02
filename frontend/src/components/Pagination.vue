<script setup lang="ts">
defineProps<{ page: number; pages: number }>();
defineEmits<{ change: [page: number] }>();
</script>
<template>
  <nav v-if="pages > 1" class="pagination" aria-label="分页">
    <button
      class="btn secondary"
      :disabled="page <= 1"
      @click="$emit('change', page - 1)"
    >
      上一页</button
    ><span>{{ page }} / {{ pages }}</span
    ><button
      class="btn secondary"
      :disabled="page >= pages"
      @click="$emit('change', page + 1)"
    >
      下一页
    </button>
  </nav>
</template>
