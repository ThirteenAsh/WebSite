<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { introPlayback } from "../lib/introPlayback";

const props = defineProps<{
  ready: boolean;
  origin?: HTMLElement;
}>();
const layer = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const phase = ref<"idle" | "burst" | "settled">("idle");

type Point = { x: number; y: number };
type Zone = { left: number; top: number; width: number; height: number };
type Particle = {
  start: Point;
  first: Point;
  second: Point;
  end: Point;
  duration: number;
  delay: number;
  width: number;
  height: number;
  rotation: number;
  spin: number;
  color: string;
  glitter: boolean;
};

let context: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let width = 0;
let height = 0;
let flightTime = 0;
let duration = 0;
let frame = 0;
let lastTime = 0;
let geometryObserver: ResizeObserver | undefined;
let themeObserver: MutationObserver | undefined;

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const random = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};
function bezier(
  t: number,
  start: number,
  first: number,
  second: number,
  end: number,
) {
  const rest = 1 - t;
  return (
    rest ** 3 * start +
    3 * rest ** 2 * t * first +
    3 * rest * t ** 2 * second +
    t ** 3 * end
  );
}

function createParticles() {
  if (!layer.value || !props.origin) return;
  const bounds = layer.value.getBoundingClientRect();
  const avatar = props.origin.getBoundingClientRect();
  const profile =
    props.origin.closest(".intro-profile")?.getBoundingClientRect() || avatar;
  const start = {
    x: avatar.left + avatar.width / 2 - bounds.left,
    y: avatar.top + avatar.height / 2 - bounds.top,
  };
  const left = Math.max(16, profile.left - bounds.left - 24);
  const right = Math.min(width - 16, profile.right - bounds.left + 24);
  const top = Math.max(16, profile.top - bounds.top - 24);
  const bottom = Math.min(height - 16, profile.bottom - bounds.top + 24);
  // 落点避开头像和文案，亮片停在这一屏的留白里。
  const zones: Zone[] = [
    { left: 16, top: 16, width: width - 32, height: top - 16 },
    { left: 16, top: bottom, width: width - 32, height: height - bottom - 32 },
    { left: 16, top, width: left - 16, height: bottom - top },
    { left: right, top, width: width - right - 16, height: bottom - top },
  ].filter((zone) => zone.width > 0 && zone.height > 0);
  if (!zones.length) return;
  const area = zones.reduce((sum, zone) => sum + zone.width * zone.height, 0);
  const style = getComputedStyle(layer.value);
  const colors = [
    style.getPropertyValue("--accent").trim(),
    style.getPropertyValue("--yellow").trim(),
    style.getPropertyValue("--green").trim(),
    "#d97757",
    "#91b5bb",
  ];
  const count = Math.round((width < 700 ? 46 : 78) * 1.2);
  particles = Array.from({ length: count }, (_, index) => {
    const seed = index * 17 + 1;
    let pick = random(seed) * area;
    const zone =
      zones.find((candidate) => {
        pick -= candidate.width * candidate.height;
        return pick <= 0;
      }) || zones[zones.length - 1]!;
    const end = {
      x: zone.left + random(seed + 1) * zone.width,
      y: zone.top + random(seed + 2) * zone.height,
    };
    const angle =
      Math.atan2(end.y - start.y, end.x - start.x) +
      (random(seed + 3) - 0.5) * 0.8;
    const reach = Math.min(width, height) * (0.42 + random(seed + 4) * 0.28);
    const glitter = index % 3 === 0;
    return {
      start,
      first: {
        x: start.x + Math.cos(angle) * reach,
        y: start.y + Math.sin(angle) * reach - 110,
      },
      second: {
        x: end.x + (random(seed + 5) - 0.5) * 90,
        y: Math.min(start.y, end.y) - 80 - random(seed + 6) * 160,
      },
      end,
      duration: 1550 + random(seed + 7) * 950,
      delay: random(seed + 8) * 90,
      width: glitter ? 3 + random(seed + 9) * 3 : 9 + random(seed + 9) * 7,
      height: glitter ? 3 : 3 + random(seed + 10) * 2,
      rotation: random(seed + 11) * Math.PI,
      spin: (random(seed + 12) - 0.5) * Math.PI * 7,
      color: colors[index % colors.length]!,
      glitter,
    };
  });
  duration = Math.max(
    ...particles.map((particle) => particle.duration + particle.delay),
  );
}

function draw() {
  if (!context) return;
  context.clearRect(0, 0, width, height);
  if (phase.value === "idle") return;
  for (const particle of particles) {
    const t = clamp((flightTime - particle.delay) / particle.duration);
    if (t <= 0) continue;
    const flutter =
      Math.sin(t * Math.PI * 5 + particle.rotation) * Math.sin(t * Math.PI);
    const x =
      bezier(
        t,
        particle.start.x,
        particle.first.x,
        particle.second.x,
        particle.end.x,
      ) +
      flutter * 12;
    const y = bezier(
      t,
      particle.start.y,
      particle.first.y,
      particle.second.y,
      particle.end.y,
    );
    context.save();
    context.translate(x, y);
    context.rotate(particle.rotation + particle.spin * t);
    context.scale(1.2, 1.2);
    context.globalAlpha = Math.min(1, t * 25) * (1 - 0.28 * t);
    context.fillStyle = particle.color;
    if (particle.glitter) {
      const size = particle.width;
      context.beginPath();
      context.moveTo(0, -size);
      context.lineTo(size * 0.42, 0);
      context.lineTo(0, size);
      context.lineTo(-size * 0.42, 0);
      context.closePath();
      context.fill();
      context.fillStyle = "#fffdf7";
      context.fillRect(-0.6, -size * 0.55, 1.2, size * 0.6);
    } else {
      context.scale(
        1,
        0.35 + Math.abs(Math.cos(particle.rotation + t * Math.PI * 5)) * 0.65,
      );
      context.fillRect(
        -particle.width / 2,
        -particle.height / 2,
        particle.width,
        particle.height,
      );
    }
    context.restore();
  }
}

function animate(now: number) {
  frame = 0;
  const delta = Math.min(50, now - lastTime);
  lastTime = now;
  flightTime = Math.min(duration, flightTime + delta);
  draw();
  if (flightTime < duration) {
    frame = requestAnimationFrame(animate);
  } else {
    phase.value = "settled";
  }
}
function play() {
  if (
    !context ||
    !props.origin ||
    !width ||
    !height ||
    !props.ready ||
    phase.value !== "idle"
  )
    return;
  createParticles();
  if (!particles.length) return;
  if (introPlayback.confettiPlayed) {
    flightTime = duration;
    phase.value = "settled";
    draw();
    return;
  }
  introPlayback.confettiPlayed = true;
  flightTime = 0;
  phase.value = "burst";
  lastTime = performance.now();
  if (!frame) frame = requestAnimationFrame(animate);
}
function resize() {
  if (!layer.value || !canvas.value) return;
  const bounds = layer.value.getBoundingClientRect();
  width = bounds.width;
  height = bounds.height;
  const density = Math.min(window.devicePixelRatio || 1, 2);
  canvas.value.width = Math.round(width * density);
  canvas.value.height = Math.round(height * density);
  context = canvas.value.getContext("2d");
  context?.setTransform(density, 0, 0, density, 0, 0);
  if (phase.value !== "idle") createParticles();
  draw();
  play();
}
function observeOrigin() {
  if (props.origin) {
    geometryObserver?.observe(props.origin);
    if (props.origin.parentElement)
      geometryObserver?.observe(props.origin.parentElement);
  }
  resize();
  if (props.ready && phase.value === "idle") play();
}

watch(() => props.ready, play, { flush: "post" });
watch(() => props.origin, observeOrigin, { flush: "post" });
onMounted(() => {
  geometryObserver = new ResizeObserver(resize);
  if (layer.value) geometryObserver.observe(layer.value);
  observeOrigin();
  themeObserver = new MutationObserver(() => {
    if (phase.value !== "idle") {
      createParticles();
      draw();
    }
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  geometryObserver?.disconnect();
  themeObserver?.disconnect();
});
</script>

<template>
  <div
    ref="layer"
    class="intro-confetti"
    :data-phase="phase"
    aria-hidden="true"
  >
    <canvas ref="canvas" />
  </div>
</template>

<style scoped>
.intro-confetti {
  position: absolute;
  inset-block: 0;
  left: 50%;
  width: 100vw;
  transform: translateX(-50%);
  overflow: hidden;
  contain: strict;
  pointer-events: none;
  z-index: -1;
}
.intro-confetti canvas {
  display: block;
  width: 100%;
  height: 100%;
}
@media (prefers-reduced-motion: reduce) {
  .intro-confetti {
    display: none;
  }
}
</style>
