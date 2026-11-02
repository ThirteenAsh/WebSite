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
