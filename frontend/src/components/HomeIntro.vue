<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { site } from "../lib/api";
import { introPlayback } from "../lib/introPlayback";
import Icon from "./Icon.vue";
import IntroConfetti from "./IntroConfetti.vue";

const emit = defineEmits<{ retry: [] }>();
const scene = ref<HTMLElement>();
const avatar = ref<HTMLElement>();
const sceneProgress = ref(0);
const revealShare = ref(1);
const scrollProgress = computed(() => sceneProgress.value / revealShare.value);
const progress = computed(() =>
  introPlayback.revealed ? 1 : Math.min(1, scrollProgress.value),
);
const elapsed = ref(0);
const reducedMotion = ref(false);
const name = computed(() => site.settings?.name || "ThirteenAsh");
const username = computed(
  () => site.settings?.github_username || "ThirteenAsh",
);
const workspace = computed(() => username.value.toLowerCase());
const siteUnavailable = computed(() => Boolean(site.error));
const introduction = computed(() => {
  if (siteUnavailable.value) {
    return {
      title: "啊哦后端似乎断啦",
      highlight: "暂时失联啦",
      description:
        "暂时没能连接到后端服务，等它回来就能见面啦。\n稍等一会儿，或试着再呼叫它一次吧。",
    };
  }
  if (!site.settings) {
    return {
      title: "正在连接创作空间，",
      highlight: "马上就能见面啦。",
      description: "正在取回我的自我介绍，请稍等一下…",
    };
  }
  return {
    title: site.settings.hero_title,
    highlight: site.settings.hero_highlight,
    description: site.settings.intro,
  };
});
const terminalStatus = computed(() => {
  if (site.loading) return "正在呼叫后端…";
  if (siteUnavailable.value) return "啊哦，暂时联系不上后端";
  return site.settings?.tagline || "正在连接创作空间…";
});

function range(value: number, start: number, end: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}
const terminalExit = computed(() => range(progress.value, 0.08, 0.46));
const avatarEnter = computed(() => range(progress.value, 0.3, 0.65));
const copyEnter = computed(() => range(progress.value, 0.42, 0.8));
const profileReady = computed(() => copyEnter.value > 0.98);
const sceneStyle = computed(() => ({
  "--terminal-opacity": 1 - terminalExit.value,
  "--terminal-y": `${-48 * terminalExit.value}px`,
  "--terminal-scale": 1 - terminalExit.value * 0.07,
  "--avatar-opacity": avatarEnter.value,
  "--avatar-y": `${40 * (1 - avatarEnter.value)}px`,
  "--avatar-scale": 0.84 + avatarEnter.value * 0.16,
  "--copy-opacity": copyEnter.value,
  "--copy-y": `${32 * (1 - copyEnter.value)}px`,
  "--intro-progress": sceneProgress.value,
}));

function typed(text: string, start: number, speed = 48) {
  return text.slice(
    0,
    Math.max(0, Math.floor((elapsed.value - start) / speed)),
  );
}

let frame = 0;
let typingTimer: ReturnType<typeof setInterval> | undefined;
let header: HTMLElement | null = null;
let headerObserver: ResizeObserver | undefined;
let motionQuery: MediaQueryList | undefined;
let lastScrollY = window.scrollY;

async function releaseDamping() {
  if (!scene.value || introPlayback.released) return;
  const stage = scene.value.querySelector<HTMLElement>(".intro-stage");
  if (!stage) return;
  const top = header?.getBoundingClientRect().height || 0;
  const distance = Math.max(0, scene.value.offsetHeight - stage.offsetHeight);
  const consumed = Math.min(
    distance,
    Math.max(0, top - scene.value.getBoundingClientRect().top),
  );
  const target = Math.max(0, window.scrollY - consumed);
  introPlayback.released = true;
  sceneProgress.value = 1;
  await nextTick();
  // 收起首次开场的滚动空间，同时补偿位置，保持可见内容不跳动。
  if (scene.value) window.scrollTo({ top: target, behavior: "instant" });
}

function updateProgress() {
  frame = 0;
  if (!scene.value) return;
  const movingUp = window.scrollY < lastScrollY - 0.5;
  lastScrollY = window.scrollY;
  if (reducedMotion.value || introPlayback.released) {
    sceneProgress.value = 1;
    return;
  }
  const stage = scene.value.querySelector<HTMLElement>(".intro-stage");
  if (!stage) return;
  const top = header?.getBoundingClientRect().height || 0;
  const distance = Math.max(1, scene.value.offsetHeight - stage.offsetHeight);
  sceneProgress.value = Math.max(
    0,
    Math.min(1, (top - scene.value.getBoundingClientRect().top) / distance),
  );
  if (avatarEnter.value === 1) introPlayback.revealed = true;
  if (introPlayback.revealed && (movingUp || sceneProgress.value >= 1)) {
    void releaseDamping();
  }
}
function queueProgress() {
  if (!frame) frame = requestAnimationFrame(updateProgress);
}
function measureHeader() {
  if (scene.value && header) {
    scene.value.style.setProperty(
      "--intro-top",
      `${header.getBoundingClientRect().height}px`,
    );
    const style = getComputedStyle(scene.value);
    const reveal = parseFloat(style.getPropertyValue("--intro-reveal-screens"));
    const hold = parseFloat(style.getPropertyValue("--intro-hold-screens"));
    // 展开动画沿用原来的距离，额外滚动距离专门用于完整介绍的停留。
    revealShare.value = reveal / (reveal + hold);
  }
  queueProgress();
}
function syncMotion() {
  reducedMotion.value = motionQuery?.matches || false;
  if (reducedMotion.value) {
    elapsed.value = 4000;
    introPlayback.revealed = true;
    introPlayback.confettiPlayed = true;
    void releaseDamping();
  }
  queueProgress();
}

onMounted(() => {
  header = document.querySelector<HTMLElement>(".site-header");
  motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  syncMotion();
  measureHeader();
  headerObserver = new ResizeObserver(measureHeader);
  if (header) headerObserver.observe(header);
  window.addEventListener("scroll", queueProgress, { passive: true });
  window.addEventListener("resize", measureHeader, { passive: true });
  motionQuery.addEventListener("change", syncMotion);
  document.fonts.ready.then(measureHeader);

  if (!reducedMotion.value && !introPlayback.revealed) {
    const started = performance.now();
    typingTimer = setInterval(() => {
      elapsed.value = performance.now() - started;
      if (elapsed.value >= 4000) clearInterval(typingTimer);
    }, 40);
  }
});
onBeforeUnmount(() => {
  if (introPlayback.revealed) introPlayback.released = true;
  cancelAnimationFrame(frame);
  clearInterval(typingTimer);
  headerObserver?.disconnect();
  motionQuery?.removeEventListener("change", syncMotion);
  window.removeEventListener("scroll", queueProgress);
  window.removeEventListener("resize", measureHeader);
});
</script>

<template>
  <section
    ref="scene"
    class="home-intro"
    :class="{
      'is-static': reducedMotion,
      'is-revealed': introPlayback.revealed,
      'is-released': introPlayback.released,
    }"
    :style="sceneStyle"
    aria-label="欢迎来到我的创作空间"
  >
    <div class="intro-stage">
      <IntroConfetti
        v-if="!reducedMotion"
        :ready="avatarEnter === 1"
        :origin="avatar"
      />
      <div class="intro-body">
        <div class="terminal-scene" aria-hidden="true">
          <p class="terminal-caption">> thirteenash</p>
          <div class="intro-terminal">
            <div class="terminal-titlebar">
              <span class="terminal-controls"><i /><i /><i /></span>
              <span>{{ workspace }} — ~/creative-journal</span>
              <span class="terminal-symbol">⌘</span>
            </div>
            <div class="terminal-body">
              <p class="terminal-comment">// 每一个想法，都从这里开始。</p>
              <div class="terminal-command">
                <span class="terminal-prompt">➜</span>
                <span class="terminal-path">~</span>
                <span>{{ typed("whoami", 220, 85) }}</span
                ><i v-if="elapsed < 900" class="terminal-cursor" />
              </div>
              <p
                class="terminal-name"
                :class="{ 'is-written': elapsed >= 900 }"
              >
                {{ name }}<span class="terminal-name-dot">.</span>
              </p>
              <div class="terminal-command">
                <span class="terminal-prompt">➜</span>
                <span class="terminal-path">~</span>
                <span>{{ typed("cat introduction.md", 1250, 42) }}</span
                ><i
                  v-if="elapsed >= 900 && elapsed < 2250"
                  class="terminal-cursor"
                />
              </div>
              <p
                class="terminal-output"
                :class="{ 'is-written': elapsed >= 2250 }"
              >
                {{ introduction.title }}<br />
                <span>{{ introduction.highlight }}</span>
              </p>
              <div class="terminal-command">
                <span class="terminal-prompt">➜</span>
                <span class="terminal-path">~</span>
                <span>{{ typed("ls ./creations", 2600, 48) }}</span
                ><i
                  v-if="elapsed >= 2250 && elapsed < 3450"
                  class="terminal-cursor"
                />
              </div>
              <div
                class="terminal-files"
                :class="{ 'is-written': elapsed >= 3450 }"
              >
                <template v-if="site.settings && !siteUnavailable">
                  <span
                    >{{
                      String(site.counts.projects).padStart(2, "0")
                    }}
                    projects/</span
                  >
                  <span
                    >{{
                      String(site.counts.writings).padStart(2, "0")
                    }}
                    notes/</span
                  >
                  <span
                    >ideas/ <i v-if="elapsed >= 3450" class="terminal-cursor"
                  /></span>
                </template>
                <span v-else class="terminal-unavailable">{{
                  siteUnavailable
                    ? "啊哦，作品清单还没送到。"
                    : "正在取回作品清单…"
                }}</span>
              </div>
            </div>
            <div class="terminal-statusbar">
              <span
                ><span
                  class="terminal-status-dot"
                  :class="{ 'is-offline': siteUnavailable || site.loading }"
                />
                {{ terminalStatus }}</span
              >
              <span
                >UTF-8 <span class="terminal-status-divider">/</span> bash</span
              >
            </div>
          </div>
        </div>

        <div class="intro-profile">
          <div ref="avatar" class="intro-avatar">
            <img
              :src="site.settings?.avatar_url || '/avatar.jpg'"
              :alt="`${name} 的头像`"
              width="112"
              height="112"
              fetchpriority="high"
            />
            <span class="avatar-code"><Icon name="code" :size="17" /></span>
            <span class="avatar-spark" aria-hidden="true">
              <img src="/claude-color.svg" alt="" width="31" height="31" />
            </span>
          </div>
          <div class="intro-copy">
            <p class="intro-greeting">
              你好，我是 <strong>{{ name }}</strong
              ><span>.</span>
            </p>
            <h1>
              {{ introduction.title }}<br />
              <span>{{ introduction.highlight }}</span>
            </h1>
            <p class="intro-description" aria-live="polite">
              {{ introduction.description }}
            </p>
            <div v-if="siteUnavailable" class="intro-recovery">
              <button
                type="button"
                class="btn secondary small intro-retry"
                :disabled="site.loading || !profileReady"
                @click="emit('retry')"
              >
                <Icon name="refresh" :size="15" />
                {{ site.loading ? "正在呼叫…" : "再呼叫一次" }}
              </button>
            </div>
            <div v-else-if="site.settings" class="intro-meta">
              <a
                :href="site.settings?.github_url"
                :tabindex="profileReady ? 0 : -1"
                target="_blank"
                rel="noopener noreferrer"
                ><Icon name="github" :size="16" /> @{{ username }}</a
              >
              <span class="intro-meta-divider">/</span>
              <span>{{ site.settings.tagline }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="intro-scroll" aria-hidden="true">
        <div class="intro-scroll-label">
          <span class="scroll-mouse"><i /></span>
          <span>{{ progress < 0.7 ? "向下滚动，认识一下" : "继续下滑" }}</span>
        </div>
        <div class="intro-track"><i /></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-intro {
  --intro-top: 104px;
  --stage-height: max(490px, calc(100svh - var(--intro-top)));
  --intro-reveal-screens: 1.2;
  --intro-hold-screens: 0.5;
  position: relative;
  height: calc(
    var(--stage-height) + 100svh *
      (var(--intro-reveal-screens) + var(--intro-hold-screens))
  );
  margin-bottom: 64px;
}
.intro-stage {
  position: sticky;
  top: var(--intro-top);
  height: var(--stage-height);
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  isolation: isolate;
}
.intro-stage::before {
  content: "";
  position: absolute;
  inset: 8% -5% 13%;
  z-index: -1;
  background-image: radial-gradient(var(--line-dark) 0.7px, transparent 0.7px);
  background-size: 22px 22px;
  mask-image: radial-gradient(ellipse at center, #0005, transparent 68%);
  pointer-events: none;
}
.intro-body {
  display: grid;
  place-items: center;
  min-height: 0;
  padding: 20px 0 30px;
}
.terminal-scene,
.intro-profile {
  grid-area: 1 / 1;
  min-width: 0;
  width: 100%;
}
.terminal-scene {
  max-width: 720px;
  opacity: var(--terminal-opacity, 1);
  transform: translateY(var(--terminal-y, 0px)) scale(var(--terminal-scale, 1));
  pointer-events: none;
}
.terminal-caption {
  margin-bottom: 13px;
  color: var(--muted);
  font:
    10px/1.5 ui-monospace,
    Consolas,
    monospace;
  letter-spacing: 2px;
}
.intro-terminal {
  overflow: hidden;
  background: var(--paper);
  border: 1.5px solid var(--ink);
  border-radius: 12px;
  box-shadow: 6px 7px 0 var(--chip);
  font-family: ui-monospace, Consolas, "Microsoft YaHei", monospace;
}
.terminal-titlebar {
  display: grid;
  grid-template-columns: 66px 1fr 66px;
  align-items: center;
  gap: 12px;
  padding: 13px 19px;
  background: color-mix(in srgb, var(--bg) 65%, var(--paper));
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font-size: 11px;
  text-align: center;
}
.terminal-controls {
  display: flex;
  gap: 7px;
}
.terminal-controls i {
  width: 10px;
  height: 10px;
  border: 1px solid var(--ink);
  border-radius: 50%;
  background: #ffb197;
}
.terminal-controls i:nth-child(2) {
  background: var(--yellow);
}
.terminal-controls i:nth-child(3) {
  background: var(--green);
}
.terminal-symbol {
  text-align: right;
  font-size: 15px;
}
.terminal-body {
  padding: 24px 32px 28px;
  font-size: 14px;
  line-height: 1.8;
}
.terminal-comment {
  color: var(--muted);
  font-size: 11px;
  margin-bottom: 19px;
}
.terminal-command {
  display: flex;
  align-items: center;
  min-height: 26px;
  white-space: pre;
}
.terminal-prompt {
  color: var(--accent);
  margin-right: 12px;
  font-weight: 700;
}
.terminal-path {
  color: var(--muted);
  margin-right: 13px;
}
.terminal-name,
.terminal-output,
.terminal-files {
  opacity: 0;
  transition: opacity 220ms;
  margin-left: 35px;
}
.is-written {
  opacity: 1;
}
.terminal-name {
  margin-top: 1px;
  margin-bottom: 18px;
  font-size: clamp(23px, 3vw, 31px);
  line-height: 1.4;
  font-weight: 800;
  letter-spacing: -1px;
}
.terminal-name-dot {
  color: var(--accent);
}
.terminal-output {
  margin-top: 3px;
  margin-bottom: 18px;
  color: var(--muted);
}
.terminal-output > span {
  color: var(--accent);
}
.terminal-files {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 27px;
  margin-top: 5px;
  font-size: 12px;
}
.terminal-files > span:first-child {
  color: var(--accent);
}
.terminal-files > span:last-child {
  color: var(--muted);
}
.terminal-cursor {
  display: inline-block;
  flex: 0 0 auto;
  width: 7px;
  height: 16px;
  margin-left: 3px;
  background: var(--accent);
  vertical-align: -3px;
  animation: terminal-blink 1.1s step-end infinite;
}
.terminal-statusbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 19px;
  border-top: 1px dashed var(--line);
  background: color-mix(in srgb, var(--bg) 35%, var(--paper));
  color: var(--muted);
  font-size: 10px;
}
.terminal-statusbar > span:first-child {
  display: flex;
  align-items: center;
  gap: 8px;
}
.terminal-status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #76a765;
}
.terminal-status-dot.is-offline {
  background: var(--accent);
}
.terminal-files > .terminal-unavailable {
  color: var(--accent);
}
.terminal-status-divider {
  color: var(--line-dark);
  padding: 0 7px;
}
.intro-profile {
  max-width: 760px;
  text-align: center;
  pointer-events: none;
}
.intro-avatar {
  position: relative;
  width: 112px;
  margin: 0 auto 25px;
  opacity: var(--avatar-opacity, 0);
  transform: translateY(var(--avatar-y, 40px)) scale(var(--avatar-scale, 0.84));
}
.intro-avatar > img {
  display: block;
  width: 112px;
  height: 112px;
  object-fit: cover;
  border: 2px solid var(--ink);
  border-radius: 50%;
  box-shadow: 4px 4px 0 var(--chip);
}
.intro-avatar::before {
  content: "";
  position: absolute;
  inset: -9px;
  border: 1px dashed var(--line-dark);
  border-radius: 50%;
  transform: rotate(-15deg);
}
.avatar-code {
  position: absolute;
  right: -4px;
  bottom: 1px;
  display: grid;
  place-items: center;
  width: 31px;
  height: 31px;
  border: 1.5px solid var(--ink);
  border-radius: 50%;
  background: var(--green);
  color: #29221d;
  transform: rotate(12deg);
}
.avatar-spark {
  position: absolute;
  top: -16px;
  right: -28px;
  width: 31px;
  height: 31px;
}
.avatar-spark img {
  display: block;
  width: 100%;
  height: 100%;
}
.intro-copy {
  opacity: var(--copy-opacity, 0);
  transform: translateY(var(--copy-y, 32px));
}
.is-revealed .intro-copy {
  transition:
    opacity 280ms ease-out,
    transform 280ms ease-out;
}
.intro-greeting {
  font-size: 15px;
  margin-bottom: 13px;
  color: var(--muted);
}
.intro-greeting strong {
  color: var(--ink);
  font-weight: 750;
}
.intro-greeting > span {
  color: var(--accent);
}
.intro-copy h1 {
  font-size: clamp(30px, 3.6vw, 45px);
  line-height: 1.45;
  font-weight: 900;
  letter-spacing: -1.7px;
  margin-bottom: 18px;
}
.intro-copy h1 > span {
  color: var(--accent);
}
.intro-description {
  color: var(--muted);
  font-size: 15px;
  line-height: 1.9;
  white-space: pre-line;
}
.intro-recovery {
  margin-top: 20px;
}
.intro-retry {
  pointer-events: auto;
}
.intro-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 11px;
  margin-top: 20px;
  font-size: 11px;
}
.intro-meta a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 650;
  pointer-events: auto;
}
.intro-meta a[tabindex="-1"] {
  pointer-events: none;
}
.intro-meta a:hover {
  color: var(--accent);
}
.intro-meta-divider {
  color: var(--line-dark);
}
.intro-scroll {
  width: 240px;
  max-width: 100%;
  margin: 0 auto;
  padding: 8px 0 26px;
  color: var(--muted);
  transition:
    opacity 400ms ease-out 120ms,
    visibility 0s linear 520ms;
}
.is-released .intro-scroll {
  opacity: 0;
  visibility: hidden;
}
.is-released .scroll-mouse i {
  animation: none;
}
.intro-scroll-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 11px;
  letter-spacing: 1px;
}
.scroll-mouse {
  display: inline-flex;
  justify-content: center;
  width: 15px;
  height: 21px;
  border: 1px solid var(--line-dark);
  border-radius: 8px;
  padding-top: 4px;
}
.scroll-mouse i {
  width: 2px;
  height: 5px;
  background: var(--accent);
  border-radius: 2px;
  animation: scroll-wheel 1.8s ease-in-out infinite;
}
.intro-track {
  height: 2px;
  background: var(--line);
  margin-top: 17px;
  overflow: hidden;
}
.intro-track i {
  display: block;
  height: 100%;
  background: var(--accent);
  transform: scaleX(var(--intro-progress, 0));
  transform-origin: left;
}
@keyframes terminal-blink {
  50% {
    opacity: 0;
  }
}
@keyframes scroll-wheel {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.5;
  }
  50% {
    transform: translateY(4px);
    opacity: 1;
  }
}
@media (max-width: 700px) {
  .home-intro {
    --intro-reveal-screens: 1;
    --intro-hold-screens: 0.4;
    margin-bottom: 42px;
  }
  .intro-body {
    padding: 15px 2px 22px;
  }
  .terminal-caption {
    font-size: 8px;
    letter-spacing: 1.2px;
  }
  .terminal-titlebar {
    grid-template-columns: 42px 1fr 16px;
    padding: 12px;
    gap: 7px;
    font-size: 9px;
  }
  .terminal-controls {
    gap: 4px;
  }
  .terminal-controls i {
    width: 8px;
    height: 8px;
  }
  .terminal-body {
    padding: 23px 18px 25px;
    font-size: 12px;
  }
  .terminal-comment {
    font-size: 10px;
  }
  .terminal-name {
    font-size: 26px;
  }
  .terminal-files {
    gap: 8px 15px;
    font-size: 10px;
  }
  .terminal-statusbar {
    padding: 9px 12px;
    font-size: 8px;
  }
  .intro-avatar {
    margin-bottom: 24px;
  }
  .intro-copy h1 {
    font-size: clamp(28px, 6.8vw, 38px);
    letter-spacing: -1px;
  }
  .intro-description {
    font-size: 13px;
  }
  .intro-greeting {
    font-size: 13px;
  }
  .intro-meta {
    font-size: 10px;
    gap: 8px;
  }
  .intro-scroll {
    width: 210px;
    padding-bottom: 22px;
  }
  .intro-scroll-label {
    font-size: 10px;
  }
}
@media (max-height: 740px) and (min-width: 701px) {
  .terminal-body {
    padding-block: 18px;
  }
  .terminal-comment {
    margin-bottom: 10px;
  }
  .terminal-name,
  .terminal-output {
    margin-bottom: 10px;
  }
  .intro-avatar,
  .intro-avatar > img {
    width: 88px;
    height: 88px;
  }
  .intro-avatar {
    margin-bottom: 17px;
  }
  .intro-copy h1 {
    font-size: 35px;
    margin-bottom: 12px;
  }
  .intro-description {
    font-size: 13px;
  }
  .intro-meta {
    margin-top: 13px;
  }
  .intro-scroll {
    padding-bottom: 18px;
  }
}
.is-released {
  height: var(--stage-height);
}
.is-released .intro-stage {
  position: relative;
  top: 0;
}
.is-static {
  height: auto;
}
.is-static .intro-stage {
  position: relative;
  top: 0;
  height: auto;
}
.is-static .terminal-scene,
.is-static .intro-scroll {
  display: none;
}
.is-static .intro-body {
  padding-block: 60px;
}
@media (prefers-reduced-motion: reduce) {
  .home-intro {
    height: auto;
  }
  .intro-stage {
    position: relative;
    top: 0;
    height: auto;
  }
  .terminal-scene,
  .intro-scroll {
    display: none;
  }
  .intro-body {
    padding-block: 60px;
  }
  .intro-avatar,
  .intro-copy {
    opacity: 1;
    transform: none;
  }
}
</style>
