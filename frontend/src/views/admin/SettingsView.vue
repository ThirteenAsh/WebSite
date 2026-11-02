<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api, site, session, notify, errorMessage } from "../../lib/api";
import type { SiteSettings } from "../../lib/types";
import Icon from "../../components/Icon.vue";
import ImageField from "../../components/ImageField.vue";
const settings = ref<SiteSettings>(),
  skills = ref(""),
  error = ref(""),
  busy = ref(false),
  changing = ref(false),
  currentPassword = ref(""),
  newPassword = ref(""),
  confirmPassword = ref(""),
  router = useRouter();
async function load() {
  error.value = "";
  try {
    settings.value = await api<SiteSettings>("/admin/settings");
    skills.value = settings.value.skills.join("\n");
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function save() {
  if (!settings.value) return;
  busy.value = true;
  try {
    settings.value.skills = skills.value
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean);
    await api("/admin/settings", {
      method: "PUT",
      body: JSON.stringify(settings.value),
    });
    await site.load();
    notify("站点设置已保存");
  } catch (e) {
    notify(errorMessage(e), "error");
  } finally {
    busy.value = false;
  }
}
async function password() {
  if (newPassword.value !== confirmPassword.value) {
    notify("两次输入的新密码不一致", "error");
    return;
  }
  changing.value = true;
  try {
    await api("/admin/password", {
      method: "PUT",
      body: JSON.stringify({
        current_password: currentPassword.value,
        new_password: newPassword.value,
      }),
    });
    currentPassword.value = "";
    newPassword.value = "";
    confirmPassword.value = "";
    session.clear();
    notify("密码已修改，请用新密码重新登录");
    await router.replace("/admin/login");
  } catch (e) {
    notify(errorMessage(e), "error");
  } finally {
    changing.value = false;
  }
}
onMounted(load);
</script>
<template>
  <div class="admin-page-heading">
    <div>
      <p class="eyebrow">MAKE THIS SPACE YOURS</p>
      <h1>站点设置<span class="heading-dot">.</span></h1>
      <p>让每个来到这里的人，多了解你一点。</p>
    </div>
    <button class="btn primary" :disabled="busy || !settings" @click="save">
      <Icon name="check" :size="17" />{{ busy ? "正在保存…" : "保存设置" }}
    </button>
  </div>
  <div v-if="error" class="error-panel" role="alert">
    {{ error }} <button class="text-link" @click="load">重试</button>
  </div>
  <div v-else-if="!settings" class="loading-panel">正在读取设置…</div>
  <div v-else class="settings-layout">
    <div>
      <section class="admin-panel settings-panel">
        <h2>个人信息与首页</h2>
        <div class="form-row">
          <label>站点名称<input v-model="settings.name" maxlength="80" /></label
          ><label
            >个人标语<input v-model="settings.tagline" maxlength="200"
          /></label>
        </div>
        <div class="form-row">
          <label
            >首页主标题<input
              v-model="settings.hero_title"
              maxlength="200" /></label
          ><label
            >首页强调文字<input
              v-model="settings.hero_highlight"
              maxlength="200"
          /></label>
        </div>
        <label
          >首页简介<textarea
            v-model="settings.intro"
            rows="3"
            maxlength="3000"
          /></label
        ><label
          >关于我<textarea
            v-model="settings.about"
            rows="4"
            maxlength="3000"
          /></label
        ><label
          >技术方向 <span class="optional">每行一项</span
          ><textarea
            v-model="skills"
            rows="4"
            placeholder="Vue / TypeScript&#10;Go / MySQL"
          />
        </label>
      </section>
      <section class="admin-panel settings-panel">
        <h2>GitHub 关联</h2>
        <label
          >GitHub 用户名<input
            v-model="settings.github_username"
            maxlength="39"
            placeholder="ThirteenAsh" /></label
        ><label
          >GitHub 个人主页<input
            v-model="settings.github_url"
            type="url"
            placeholder="https://github.com/ThirteenAsh"
        /></label>
        <p class="muted small-text">
          用户名决定可导入的公开仓库；已关联项目仍按各自仓库地址同步。API Token
          只在后端环境配置中保存。
        </p>
      </section>
    </div>
    <aside>
      <section class="admin-panel settings-panel">
        <h2>个人头像</h2>
        <ImageField v-model="settings.avatar_url" label="头像" />
      </section>
      <section class="admin-panel settings-panel">
        <h2>修改管理员密码</h2>
        <p class="muted small-text">密码修改后，所有登录会话都会失效。</p>
        <form @submit.prevent="password">
          <label
            >当前密码<input
              v-model="currentPassword"
              type="password"
              required
              autocomplete="current-password"
              maxlength="72" /></label
          ><label
            >新密码<input
              v-model="newPassword"
              type="password"
              required
              minlength="12"
              maxlength="72"
              autocomplete="new-password"
              placeholder="至少 12 字符" /></label
          ><label
            >确认新密码<input
              v-model="confirmPassword"
              type="password"
              required
              minlength="12"
              maxlength="72"
              autocomplete="new-password" /></label
          ><button
            class="btn secondary full-width"
            type="submit"
            :disabled="changing"
          >
            {{ changing ? "正在修改…" : "更新密码" }}
          </button>
        </form>
      </section>
      <div class="settings-note">
        <Icon name="eye" :size="18" />
        <p>
          站内搜索正常开放；所有页面声明不被搜索引擎收录。本站不提供评论、留言或访客注册。
        </p>
      </div>
    </aside>
  </div>
</template>
