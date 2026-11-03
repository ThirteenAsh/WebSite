<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { session, errorMessage } from "../../lib/api";
import { showError } from "../../lib/dialogs";
import Icon from "../../components/Icon.vue";
const route = useRoute(),
  router = useRouter(),
  username = ref(""),
  password = ref(""),
  error = ref(""),
  busy = ref(false);
document.documentElement.dataset.theme = "light";
function destination() {
  const next = typeof route.query.next === "string" ? route.query.next : "";
  return next.startsWith("/admin") && !next.startsWith("/admin/login")
    ? next
    : "/admin";
}
onMounted(async () => {
  try {
    await session.check();
    router.replace(destination());
  } catch {
    /* 未登录时显示表单 */
  }
});
async function login() {
  busy.value = true;
  error.value = "";
  try {
    await session.login(username.value, password.value);
    password.value = "";
    await router.replace(destination());
  } catch (e) {
    error.value = errorMessage(e);
    void showError(error.value, "登录未成功");
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <main class="login-page">
    <RouterLink to="/" class="text-link login-back"
      ><Icon name="back" :size="17" />返回个人空间</RouterLink
    >
    <section class="login-card paper-card">
      <span class="login-mark"><Icon name="code" :size="32" /></span>
      <p class="eyebrow">A SMALL SPACE, BIG IDEAS</p>
      <h1>欢迎回来。</h1>
      <p class="muted">把今天的想法，留在这里。</p>
      <form @submit.prevent="login">
        <label
          >管理员账号<input
            v-model="username"
            autocomplete="username"
            required
            maxlength="80"
            placeholder="输入账号" /></label
        ><label
          >密码<input
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            maxlength="72"
            placeholder="输入密码"
        /></label>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="btn primary" type="submit" :disabled="busy">
          {{ busy ? "正在登录…" : "进入工作台"
          }}<Icon name="right" :size="17" />
        </button>
      </form>
      <p class="login-footnote">仅供站点管理员使用 · 不开放注册</p>
    </section>
  </main>
</template>
