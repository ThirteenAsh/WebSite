# 代码与数据结构

## 目录

```text
backend/
  cmd/server/main.go   唯一程序入口，接收 serve / init / reset-password 命令
  internal/
    app/               装配依赖、执行维护命令、启动与关闭服务
    config/            环境配置加载、默认值和校验
    database/          MySQL 连接池及数据库初始化
    bootstrap/         管理员初始化、重置密码、旧网页数据迁入
      data/projects.json  原网页四个项目的初始数据
    model/             内容、站点信息、上传图片的数据模型
    repository/        内容行映射、内容插入、站点信息读取
    github/            独立 GitHub HTTP 客户端、公开仓库分页和详情
    httpapi/           HTTP 路由、认证、内容/图片/设置接口、定时任务
      integration_test.go  独立临时 MySQL 库的接口集成测试
  migrations/
    001_init.sql       唯一的初始建表 SQL
    embed.go           将 SQL 嵌入二进制，避免运行时依赖源文件位置
  bin/                 编译产物，Git 忽略
  uploads/             上传图片，Git 忽略
  .env                 本机配置，Git 忽略
  .env.example         可提交的配置示例
  go.mod / go.sum       模块与依赖
frontend/src/
  layouts/             公开布局、后台布局
  views/               首页、列表、详情、搜索、404
  views/admin/         登录、工作台、内容编辑/管理、GitHub、图片、设置
  components/          Markdown、卡片、点赞、图片选择、放大、分页
  lib/                 类型、请求、会话、通知、站点信息、Markdown
  router/              Vue Router 路由及后台登录检查
  style.css            延续原网页的样式与公开页面的响应式规则
scripts/
  dev-backend.ps1       仅启动 Go 开发服务
  go.ps1                在 backend 工作目录运行 Go 命令，缓存留在项目内
  start-local.ps1       构建前端、初始化数据库并启动完整网站
```

采用 Go 官方服务端项目指南中的 [`cmd` + `internal` 组织惯例](https://go.dev/doc/modules/layout#server-project)。Go 没有强制要求所有网站采用同一套分层目录；当前按实际职责拆包，程序入口只调用 `internal/app`，业务接口不再放在 `package main` 中。

依赖方向为 `cmd/server → app → config / database / bootstrap / httpapi`；HTTP 层使用 `model / repository / github`，这些底层包不导入 HTTP 层。外部仓库请求通过构造函数注入客户端，测试可替换为本地模拟服务。

日常开发在 `backend` 执行 `go run ./cmd/server serve`，或在仓库根目录执行 `scripts/dev-backend.ps1`。数据库结构和现有数据不因本次目录调整而改变。

## 数据库

全部日期在 MySQL 使用 UTC 保存，前端按上海时间显示；每日任务按 `TIMEZONE` 配置。数据库使用 InnoDB、utf8mb4。

| 表 | 用途 | 关联与约束 |
| --- | --- | --- |
| `admins` | 唯一站主的登录账号和密码哈希 | 用户名唯一，不开放注册 |
| `sessions` | 登录 token 哈希、CSRF token、会话有效期 | 关联管理员，删除管理员级联清理 |
| `settings` | 个人介绍、首页文案、头像、GitHub 配置 | 固定一行 JSON 配置 |
| `contents` | 作品、长文章、短动态 | `kind` 区分三种形式；`status` 区分草稿/发布；`repo_id` 唯一 |
| `content_likes` | 每个浏览器的点赞状态 | 内容 ID＋浏览器哈希联合主键；删除内容级联清理 |
| `content_views` | 最近一次计数时间 | 内容 ID＋浏览器哈希联合主键；删除内容级联清理 |
| `uploads` | 图片文件名、类型、尺寸和大小 | 原图在本地文件目录，数据库不保存二进制图片 |
| `app_state` | 初始迁入标记、最近 GitHub 同步结果 | 按键保存内部状态 |

公开接口的列表、详情和互动都在服务端约束 `status='published'`。前端路由检查只负责体验，后台接口另有会话和 CSRF 检查。

文章与日常各有独立的前台、后台入口：`/articles` 与 `/admin/contents` 仅显示文章；`/moments` 与 `/admin/moments` 仅显示日常。日常使用独立的编辑器和动态组件，保存时仅提交 `kind/body/images/status`；服务端移除日常的标题、标记、摘要、封面等文章字段，保留有序的 0–9 张配图，文字和图片不能同时为空。旧日常的 `/articles/:id`、`/admin/contents/:id` 以及新建入口 `?kind=moment` 会转到对应日常页面，不需要数据库迁移。

`GET /site` 的数量分别提供 `articles` 和 `moments`，并保留两者合计的 `writings`。统一搜索仍可查询全部形式；首页通过 `kind=writing` 混合请求文章与日常，按首次发布时间倒序展示最新五条记录，不按内容形式分区。

点赞和浏览更新在数据库事务内锁定对应内容行，以保证并发下累计计数和去重记录一致。点赞使用“设为已赞/未赞”的幂等接口，重复请求不会反转状态。

仓库元数据与展示文案分开：`repo_*` 字段由 GitHub 更新；标题、摘要、Markdown 正文、链接、技术标签、排序及精选由后台维护。

## 主要接口

所有业务接口在 `/api` 下，错误统一返回 `{ "error": "可读信息" }`。列表支持分页。管理员写入需登录 Cookie 和 `X-CSRF-Token`。

| 方法与路径 | 用途 |
| --- | --- |
| `GET /health` | 数据库连通检查 |
| `GET /site` | 公开个人信息和发布数量 |
| `GET /contents` | 公开列表及统一搜索；参数 `kind / featured / q / page / limit` |
| `GET /contents/{id}` | 已发布详情，含当前浏览器点赞状态 |
| `POST /visitor` | 初始化随机访客 Cookie |
| `POST /contents/{id}/view` | 浏览计数，30 分钟去重 |
| `PUT /contents/{id}/like` | `{ "liked": true/false }` |
| `POST /admin/login` | 独立管理员账号登录 |
| `GET /admin/me` | 当前账号及 CSRF token |
| `POST /admin/logout` | 注销当前会话 |
| `PUT /admin/password` | 修改密码、注销全部会话 |
| `GET /admin/dashboard` | 内容状态与互动统计、上次同步结果 |
| `GET/POST /admin/contents` | 管理列表、新建内容 |
| `GET/PUT/DELETE /admin/contents/{id}` | 读取/编辑/删除；发布和撤回均通过 PUT 的 status 字段 |
| `GET/PUT /admin/settings` | 读取和修改站点信息 |
| `GET /admin/github/repos` | 用户公开仓库及导入状态 |
| `POST /admin/github/import` | `{ "ids": [...] }` 导入到草稿 |
| `POST /admin/github/sync` | 同步全部已关联项目，含草稿；返回逐项失败信息 |
| `GET/POST /admin/uploads` | 图片分页、multipart file 上传 |
| `DELETE /admin/uploads/{id}` | 拒绝删除被内容或站点引用的图片 |

`/uploads/{filename}` 是独立图片资源路径，不在 `/api` 下。

## 验证范围

前端类型检查和正式构建、真实 MySQL 事务测试，以及 Edge 浏览器的电脑/手机页面、登录、编辑预览、发布撤回、搜索、点赞、图片上传、设置与 GitHub 同步。功能验收不等于对公网流量的压力测试；后续内容量和访问量增长后，再依据实测调整索引、图片缩略图和连接池。
