<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from "vue";
import Icon from "./Icon.vue";

const props = defineProps<{
  modelValue: string;
  options: readonly { value: string; label: string; group?: string }[];
  label: string;
  disabled?: boolean;
  searchable?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
  change: [value: string];
}>();
const id = useId();
const trigger = ref<HTMLButtonElement>();
const panel = ref<HTMLElement>();
const list = ref<HTMLElement>();
const search = ref<HTMLInputElement>();
const target = ref<HTMLElement | string>("body");
const open = ref(false);
const active = ref(0);
const query = ref("");
const options = computed(() => {
  const words = query.value.trim().toLocaleLowerCase().split(/\s+/);
  return props.options.filter(({ label, group }) => {
    const text = `${label} ${group || ""}`.toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
});
watch(
  query,
  () => {
    active.value = 0;
    if (list.value) list.value.scrollTop = 0;
  },
  { flush: "sync" },
);
const placement = ref({
  top: "0px",
  bottom: "auto",
  left: "0px",
  width: "190px",
  maxHeight: "320px",
});
const above = ref(false);
const selectedLabel = computed(
  () =>
    props.options.find((o) => o.value === props.modelValue)?.label || "请选择",
);
let typed = "";
let typedTimer: ReturnType<typeof setTimeout> | undefined;

function position(chooseDirection = false) {
  if (!open.value || !trigger.value) return;
  const rect = trigger.value.getBoundingClientRect();
  const width = Math.min(Math.max(rect.width, 190), window.innerWidth - 24);
  const naturalHeight = Math.min(
    (list.value?.scrollHeight || 320) + (search.value ? 56 : 16),
    320,
  );
  const below = window.innerHeight - rect.bottom - 20;
  if (chooseDirection)
    above.value = below < naturalHeight && rect.top - 20 > below;
  const maxHeight = Math.max(
    60,
    Math.min(320, above.value ? rect.top - 20 : below),
  );
  placement.value = {
    left: `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`,
    top: above.value ? "auto" : `${rect.bottom + 8}px`,
    bottom: above.value ? `${window.innerHeight - rect.top + 8}px` : "auto",
    width: `${width}px`,
    maxHeight: `${maxHeight}px`,
  };
}
async function show() {
  if (props.disabled || !props.options.length) return;
  query.value = "";
  target.value = trigger.value?.closest("dialog") || "body";
  active.value = Math.max(
    0,
    props.options.findIndex((o) => o.value === props.modelValue),
  );
  open.value = true;
  position(true);
  await nextTick();
  position(true);
  search.value?.focus({ preventScroll: true });
  reveal();
}
function close() {
  open.value = false;
}
function reveal() {
  nextTick(() => {
    const row = list.value?.querySelector(`[data-index="${active.value}"]`);
    if (!row || !list.value) return;
    const bounds = row.getBoundingClientRect();
    const viewport = list.value.getBoundingClientRect();
    if (bounds.top < viewport.top)
      list.value.scrollTop += bounds.top - viewport.top;
    else if (bounds.bottom > viewport.bottom)
      list.value.scrollTop += bounds.bottom - viewport.bottom;
  });
}
function choose(index: number) {
  const option = options.value[index];
  if (!option) return;
  const changed = option.value !== props.modelValue;
  emit("update:modelValue", option.value);
  if (changed) emit("change", option.value);
  close();
  trigger.value?.focus({ preventScroll: true });
}
async function keyboard(event: KeyboardEvent) {
  if (props.disabled || event.isComposing || event.keyCode === 229) return;
  const inSearch = event.target === search.value;
  if (event.key === "Tab") {
    close();
    return;
  }
  if (event.key === "Escape") {
    if (!open.value) return;
    event.preventDefault();
    event.stopPropagation();
    close();
    trigger.value?.focus({ preventScroll: true });
    return;
  }
  if (inSearch && !["Enter", "ArrowDown", "ArrowUp"].includes(event.key))
    return;
  if (
    ["Enter", " ", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
  ) {
    event.preventDefault();
    if (!open.value) {
      await show();
      if (event.key === "Home") active.value = 0;
      if (event.key === "End") active.value = props.options.length - 1;
    } else if (event.key === "Enter" || event.key === " ") choose(active.value);
    else if (event.key === "Home") active.value = 0;
    else if (event.key === "End") active.value = options.value.length - 1;
    else if (options.value.length)
      active.value =
        (active.value +
          (event.key === "ArrowDown" ? 1 : -1) +
          options.value.length) %
        options.value.length;
    reveal();
  } else if (
    event.key.length === 1 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    event.preventDefault();
    if (!open.value) await show();
    clearTimeout(typedTimer);
    typed += event.key.toLocaleLowerCase();
    const index = options.value.findIndex((o) =>
      o.label.toLocaleLowerCase().startsWith(typed),
    );
    if (index >= 0) {
      active.value = index;
      reveal();
    }
    typedTimer = setTimeout(() => {
      typed = "";
    }, 600);
  }
}
function focusOutside(event: FocusEvent) {
  const next = event.relatedTarget as Node | null;
  if (!trigger.value?.contains(next) && !panel.value?.contains(next)) close();
}
const reposition = () => position();
function outside(event: PointerEvent) {
  const target = event.target as Node;
  if (!trigger.value?.contains(target) && !panel.value?.contains(target))
    close();
}
onMounted(() => {
  document.addEventListener("pointerdown", outside);
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside);
  window.removeEventListener("resize", reposition);
  window.removeEventListener("scroll", reposition, true);
  clearTimeout(typedTimer);
});
</script>

<template>
  <div class="paper-select">
    <button
      ref="trigger"
      type="button"
      class="paper-select-trigger"
      role="combobox"
      :aria-label="label"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-controls="`${id}-list`"
      :aria-activedescendant="open ? `${id}-${active}` : undefined"
      :disabled="disabled"
      @click="open ? close() : show()"
      @keydown="keyboard"
      @blur="focusOutside"
    >
      <span>{{ selectedLabel }}</span
      ><svg
        class="select-chevron"
        :class="{ expanded: open }"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
    <Teleport :to="target">
      <Transition name="select-pop">
        <div
          v-if="open"
          ref="panel"
          class="paper-select-menu"
          :class="{ above }"
          :style="placement"
          @focusout="focusOutside"
        >
          <input
            v-if="searchable"
            ref="search"
            v-model="query"
            class="paper-select-search"
            type="search"
            role="combobox"
            aria-label="搜索分类标题"
            aria-autocomplete="list"
            aria-expanded="true"
            :aria-controls="`${id}-list`"
            :aria-activedescendant="
              options[active] ? `${id}-${active}` : undefined
            "
            placeholder="搜索分类标题…"
            @keydown="keyboard"
          />
          <div
            :id="`${id}-list`"
            ref="list"
            class="paper-select-list"
            role="listbox"
            :aria-label="label"
          >
            <template v-for="(option, index) in options" :key="option.value">
              <div
                v-if="
                  option.group && option.group !== options[index - 1]?.group
                "
                class="paper-select-group"
                aria-hidden="true"
              >
                {{ option.group }}
              </div>
              <div
                :id="`${id}-${index}`"
                role="option"
                :aria-selected="option.value === modelValue"
                :data-index="index"
                class="paper-select-option"
                :class="{
                  'paper-select-option--grouped': option.group,
                  selected: option.value === modelValue,
                  active: index === active,
                }"
                @pointermove="active = index"
                @mousedown.prevent
                @click="choose(index)"
              >
                <span>{{ option.label }}</span
                ><Icon
                  v-if="option.value === modelValue"
                  name="check"
                  :size="17"
                />
              </div>
            </template>
          </div>
          <p
            v-if="!options.length"
            class="paper-select-empty muted"
            role="status"
          >
            没有匹配的分类
          </p>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
