# ThirteenAsh 前端

Vue 3 + TypeScript + Vite。公开网站适配手机，管理后台按电脑端设计。

完整启动、数据库 SQL、管理员初始化及功能说明见 [项目 README](../README.md)。

```text
npm ci
npm run dev       # 127.0.0.1:5173，代理到 Go 的 8080 端口
npm run build     # 类型检查及正式构建，输出 dist/
npm run test:e2e  # 启动前后端后运行浏览器验收
npm run format   # 代码格式化
```

前端没有内置管理员密码，登录会话由 Go 后端维护。

## 从页面定位 Vue 源码

开发模式已启用 `vite-plugin-vue-inspector`。在 `frontend` 目录执行 `npm run dev`，打开 <http://127.0.0.1:5173/>，点击页面右上角的定位按钮，或按 `Ctrl+Shift` 切换定位模式，再点击页面元素，即可在 VS Code 中打开对应的 `.vue` 文件和代码行。再次按 `Ctrl+Shift` 可退出定位模式。

安装插件后，已经运行的开发服务需要重启。此功能仅在 Vite 开发模式下生效，正式构建后的 8080 页面不提供定位按钮。需确保 VS Code 的 `code` 命令可用。
