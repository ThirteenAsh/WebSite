<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
} from "vue";
import Icon from "./Icon.vue";

const props = defineProps<{
  modelValue: string;
  options: readonly { value: string; label: string }[];
  label: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
  change: [value: string];
}>();
const id = useId();
const trigger = ref<HTMLButtonElement>();
const panel = ref<HTMLElement>();
const open = ref(false);
const active = ref(0);
const placement = ref({
  top: "0px",
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

function position() {
  if (!open.value || !trigger.value) return;
  const rect = trigger.value.getBoundingClientRect();
  const width = Math.min(Math.max(rect.width, 190), window.innerWidth - 24);
  const naturalHeight = Math.min(panel.value?.scrollHeight || 320, 320);
  const below = window.innerHeight - rect.bottom - 20;
  above.value = below < naturalHeight && rect.top > below;
  const maxHeight = Math.max(
    60,
    Math.min(320, above.value ? rect.top - 20 : below),
  );
  const height = Math.min(naturalHeight, maxHeight);
  placement.value = {
    left: `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`,
    top: `${above.value ? Math.max(12, rect.top - height - 8) : rect.bottom + 8}px`,
    width: `${width}px`,
    maxHeight: `${maxHeight}px`,
  };
}
async function show() {
  if (props.disabled || !props.options.length) return;
  active.value = Math.max(
    0,
    props.options.findIndex((o) => o.value === props.modelValue),
  );
  open.value = true;
  position();
  await nextTick();
  position();
  reveal();
}
function close() {
  open.value = false;
}
function reveal() {
  nextTick(() =>
    panel.value
      ?.querySelector(`[data-index="${active.value}"]`)
      ?.scrollIntoView({ block: "nearest" }),
  );
}
function choose(index: number) {
  const option = props.options[index];
  if (!option) return;
  const changed = option.value !== props.modelValue;
  emit("update:modelValue", option.value);
  if (changed) emit("change", option.value);
  close();
  trigger.value?.focus({ preventScroll: true });
}
async function keyboard(event: KeyboardEvent) {
  if (props.disabled) return;
  if (event.key === "Tab") {
    close();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    close();
    return;
  }
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
    else if (event.key === "End") active.value = props.options.length - 1;
    else
      active.value =
        (active.value +
          (event.key === "ArrowDown" ? 1 : -1) +
          props.options.length) %
        props.options.length;
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
    const index = props.options.findIndex((o) =>
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
function outside(event: PointerEvent) {
  const target = event.target as Node;
  if (!trigger.value?.contains(target) && !panel.value?.contains(target))
    close();
}
onMounted(() => {
  document.addEventListener("pointerdown", outside);
  window.addEventListener("resize", position);
  window.addEventListener("scroll", position, true);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside);
  window.removeEventListener("resize", position);
  window.removeEventListener("scroll", position, true);
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
      @blur="close"
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
    <Teleport to="body">
      <Transition name="select-pop">
        <div
          v-if="open"
          :id="`${id}-list`"
          ref="panel"
          class="paper-select-menu"
          :class="{ above }"
          :style="placement"
          role="listbox"
          :aria-label="label"
        >
          <div
            v-for="(option, index) in options"
            :id="`${id}-${index}`"
            :key="option.value"
            role="option"
            :aria-selected="option.value === modelValue"
            :data-index="index"
            class="paper-select-option"
            :class="{
              selected: option.value === modelValue,
              active: index === active,
            }"
            @pointermove="active = index"
            @mousedown.prevent
            @click="choose(index)"
          >
            <span>{{ option.label }}</span
            ><Icon v-if="option.value === modelValue" name="check" :size="17" />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
