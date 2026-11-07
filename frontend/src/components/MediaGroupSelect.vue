<script setup lang="ts">
import { computed } from "vue";
import { formatDate, type UploadGroup } from "../lib/types";
import PaperSelect from "./PaperSelect.vue";

const scope = defineModel<string>({ required: true });
const props = defineProps<{
  groups: UploadGroup[];
  label: string;
  all?: boolean;
}>();
const options = computed(() => {
  const common: { value: string; label: string }[] = [];
  if (props.all) common.push({ value: "", label: "全部图片" });
  common.push({ value: "0", label: "未归类" });
  if (
    Number(scope.value) &&
    !props.groups.some((g) => String(g.id) === scope.value)
  ) {
    common.push({ value: scope.value, label: `内容 #${scope.value}` });
  }
  const sections = [
    { kind: "article", label: "文章" },
    { kind: "project", label: "作品" },
    { kind: "moment", label: "日常" },
  ];
  return [
    ...common,
    ...sections.flatMap((section) =>
      props.groups
        .filter((group) => group.kind === section.kind)
        .map((group) => ({
          value: String(group.id),
          label:
            group.title || `${formatDate(group.created_at)} 日常 #${group.id}`,
          group: section.label,
        })),
    ),
  ];
});
</script>

<template>
  <PaperSelect
    v-model="scope"
    class="media-group-select"
    :options="options"
    :label="label"
    searchable
  />
</template>
