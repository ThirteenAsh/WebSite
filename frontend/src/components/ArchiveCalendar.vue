<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{
  kind: "projects" | "articles";
  count: number | null;
}>();
const copy = computed(() =>
  props.kind === "projects"
    ? {
        title: "我的创作档案",
        label: "已公开作品",
        motto: "KEEP BUILDING",
        caption: "欢迎来看",
        unit: "个作品",
      }
    : {
        title: "我的文字档案",
        label: "文章与随笔",
        motto: "KEEP WRITING",
        caption: "一些实用分享与思考",
        unit: "篇记录",
      },
);
const number = computed(() =>
  props.count === null ? "—" : String(props.count).padStart(2, "0"),
);
</script>
<template>
  <aside
    class="archive-calendar"
    :class="{
      'archive-calendar--notes': kind === 'articles',
      'archive-calendar--many': count !== null && count >= 100,
    }"
    :aria-label="
      count === null
        ? `${copy.title}，数量暂未获取`
        : `${copy.title}，共 ${count} ${copy.unit}`
    "
  >
    <div class="archive-calendar-top">{{ copy.title }}</div>
    <div class="archive-calendar-body">
      <p class="archive-calendar-label">{{ copy.label }}</p>
      <strong class="archive-calendar-number">{{ number }}</strong>
      <div class="archive-calendar-bottom">
        <strong>{{ copy.motto }}</strong>
        <p>{{ copy.caption }}</p>
      </div>
    </div>
  </aside>
</template>
<style scoped>
.archive-calendar {
  position: relative;
  width: 200px;
  margin: 14px 7px 9px 0;
  background: var(--paper);
  border: 2px solid var(--ink);
  border-radius: 9px 9px 3px 3px;
  box-shadow: 4px 7px 0 var(--shadow);
  text-align: center;
  transform: rotate(2.5deg);
}
.archive-calendar::before,
.archive-calendar::after {
  content: "";
  position: absolute;
  top: -14px;
  width: 12px;
  height: 31px;
  border: 2px solid var(--ink);
  border-radius: 12px;
  background: var(--bg);
  box-shadow: 1px 2px 0 var(--shadow);
}
.archive-calendar::before {
  left: 24%;
}
.archive-calendar::after {
  right: 24%;
}
.archive-calendar-top {
  padding: 21px 8px 11px;
  border-bottom: 2px dashed #29221d;
  border-radius: 7px 7px 0 0;
  background: var(--yellow);
  color: #29221d;
  font:
    600 14px/1.6 "KaiTi",
    "STKaiti",
    serif;
  letter-spacing: 2px;
}
.archive-calendar--notes .archive-calendar-top {
  background: var(--green);
}
.archive-calendar-body {
  padding: 17px 14px 15px;
}
.archive-calendar-label {
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 3px;
}
.archive-calendar-number {
  display: block;
  margin: 3px 0 5px;
  font-size: 78px;
  font-weight: 950;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  letter-spacing: -4px;
}
.archive-calendar--many .archive-calendar-number {
  font-size: 56px;
}
.archive-calendar-bottom {
  margin-top: 15px;
  padding-top: 13px;
  border-top: 1px dashed var(--line-dark);
}
.archive-calendar-bottom strong {
  display: block;
  font:
    750 14px/1.7 ui-monospace,
    Consolas,
    monospace;
  letter-spacing: 1px;
}
.archive-calendar-bottom p {
  margin-top: 3px;
  color: var(--muted);
  font:
    12px/1.7 "KaiTi",
    "STKaiti",
    serif;
}
@media (max-width: 700px) {
  .archive-calendar {
    width: 150px;
  }
  .archive-calendar-top {
    font-size: 12px;
    letter-spacing: 1px;
  }
  .archive-calendar-body {
    padding: 13px 10px 12px;
  }
  .archive-calendar-label {
    font-size: 10px;
    letter-spacing: 2px;
  }
  .archive-calendar-number {
    font-size: 62px;
  }
  .archive-calendar--many .archive-calendar-number {
    font-size: 44px;
  }
  .archive-calendar-bottom {
    margin-top: 11px;
    padding-top: 10px;
  }
  .archive-calendar-bottom strong {
    font-size: 11px;
    letter-spacing: 0.5px;
  }
  .archive-calendar-bottom p {
    font-size: 11px;
  }
}
@media (max-width: 480px) {
  .archive-calendar {
    width: 124px;
    box-shadow: 3px 5px 0 var(--shadow);
  }
  .archive-calendar::before,
  .archive-calendar::after {
    width: 10px;
    height: 27px;
    top: -12px;
  }
  .archive-calendar-top {
    padding: 19px 4px 8px;
    font-size: 11px;
  }
  .archive-calendar-body {
    padding: 11px 8px 10px;
  }
  .archive-calendar-label {
    font-size: 9px;
    letter-spacing: 1px;
  }
  .archive-calendar-number {
    font-size: 52px;
    letter-spacing: -3px;
  }
  .archive-calendar--many .archive-calendar-number {
    font-size: 36px;
  }
  .archive-calendar-bottom strong {
    font-size: 9px;
    letter-spacing: 0.4px;
  }
  .archive-calendar-bottom p {
    font-size: 9px;
    white-space: nowrap;
  }
}
</style>
