import { computed, onBeforeUnmount, ref } from "vue";
import { api, errorMessage } from "./api";
import type { Content, Page } from "./types";

export function useInfiniteFeed(path: string) {
  const items = ref<Content[]>([]),
    page = ref(0),
    pages = ref(0);
  const loading = ref(false),
    loadingMore = ref(false);
  const error = ref(""),
    moreError = ref("");
  const hasMore = computed(() => page.value < pages.value);
  let generation = 0;
  async function fetchPage(number: number) {
    return api<Page<Content>>(`${path}${number > 1 ? `&page=${number}` : ""}`);
  }
  async function reset(start = 1) {
    const id = ++generation;
    loading.value = true;
    loadingMore.value = false;
    error.value = moreError.value = "";
    items.value = [];
    page.value = pages.value = 0;
    try {
      const data =
        start === 1
          ? await fetchPage(1)
          : await api<Page<Content>>(`${path}&page=${start}`);
      if (id !== generation) return;
      items.value = data.items;
      page.value = data.page;
      pages.value = data.pages;
    } catch (e) {
      if (id === generation) error.value = errorMessage(e);
    } finally {
      if (id === generation) loading.value = false;
    }
  }
  async function loadMore() {
    if (loading.value || loadingMore.value || !hasMore.value) return;
    const id = generation;
    loadingMore.value = true;
    moreError.value = "";
    try {
      const data = await fetchPage(page.value + 1);
      if (id !== generation) return;
      const seen = new Set(items.value.map((item) => item.id));
      items.value.push(
        ...data.items.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        }),
      );
      page.value = data.page;
      pages.value = data.pages;
    } catch (e) {
      if (id === generation) moreError.value = errorMessage(e);
    } finally {
      if (id === generation) loadingMore.value = false;
    }
  }
  onBeforeUnmount(() => generation++);
  return {
    items,
    loading,
    loadingMore,
    error,
    moreError,
    hasMore,
    reset,
    loadMore,
  };
}
