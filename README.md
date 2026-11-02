# ThirteenAsh 个人空间

Vue 3 + TypeScript 前端、Go 后端、MySQL 数据库。延续 `index-example.html` 的暖色、卡片、深浅色风格，首页为「个人介绍 → 精选作品 → 文章与日常」。原始 HTML 保留不动。

## 本机直接使用

本次开发已连接本机 MySQL，创建独立的 `thirteenash` 数据库并初始化四个原有作品。没有修改其他业务库。

- 本地数据库配置：`backend/.env`，已被 Git 忽略。
- 管理员账号和随机初始密码：`.local/access.txt`，已被 Git 忽略。网站管理员与 MySQL 账号是两套账号。
- 前台：<http://127.0.0.1:8080/>；后台：<http://127.0.0.1:8080/admin>。

如果服务尚未启动，在项目根目录运行：

```powershell
.\scripts\start-local.ps1
```

脚本会构建前端、执行可重复的数据库初始化，然后在前台启动一个 Go 服务，同时提供页面和接口。按 Ctrl+C 停止。已构建后可使用 `-SkipBuild`。

## 从零启动

需要 Node.js `^22.18.0 || >=24.12.0`、Go **1.26 或更高**、MySQL **8.0 或更高**。后端没有 Redis、独立搜索服务或其他常驻依赖。

1. 复制 `backend/.env.example` 为 `backend/.env`，填写 `DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME`。
2. 设置 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`。初始密码需 12–72 字节，不提供内置默认密码。
3. 在 `frontend` 执行 `npm ci`、`npm run build`。
4. 在 `backend` 执行 `go run ./cmd/server init`、`go run ./cmd/server serve`。
5. 打开 <http://127.0.0.1:8080/>。

`init` 会创建配置指定的数据库、建表、初始化管理员，并迁入旧网页的四个项目及站点介绍。重复执行不会重置管理员、覆盖编辑过的内容或重复导入作品。若数据库账号没有建库权限，请先用宝塔或 MySQL 客户端建立数据库，并授予该账号库内建表、读写权限。

### SQL 脚本

完整建表脚本为 **[backend/migrations/001_init.sql](backend/migrations/001_init.sql)**，可以在 MySQL 客户端中选中本站数据库后执行，也可以直接执行 `go run ./cmd/server init`，它使用同一份嵌入的 SQL。SQL 不包含密码，不删除数据。

手动导入示例（密码由客户端交互输入）：

```text
mysql -h 127.0.0.1 -u YOUR_USER -p YOUR_DATABASE
mysql> SOURCE E:/01_MyCode/05_project/thirteenash/backend/migrations/001_init.sql;
```

只执行 SQL 不会创建管理员或初始内容，之后仍应执行一次 `go run ./cmd/server init`。

### 日常开发

打开两个终端：

```powershell
# 终端一，在项目根目录，只启动 Go 后端
.\scripts\dev-backend.ps1
```

```powershell
# 终端二
cd frontend
npm run dev
```

开发地址为 <http://127.0.0.1:5173/>。Vite 将 `/api` 和 `/uploads` 转发到 Go 的 8080 端口。直接构建后的 8080 地址也可以使用，前端改动需要重新构建才能在该地址生效。

不用脚本时，Go 的等价启动命令是：

```powershell
cd E:\01_MyCode\05_project\thirteenash\backend
go run ./cmd/server serve
```

后端地址为 <http://127.0.0.1:8080/>，健康检查为 <http://127.0.0.1:8080/api/health>。日常启动使用 `serve` 即可，不需要反复初始化数据库。修改 Go 代码后，按 Ctrl+C 停止并重新执行；当前没有自动热重载。请在 `backend` 工作目录启动，以正确读取 `.env` 及相对图片、前端路径。

## 已实现功能

| 模块 | 行为 |
| --- | --- |
| 首页 | 可编辑个人介绍、单列紧凑展示四个作品、最新五条文章及动态、关于我 |
| 作品 | 独立列表与详情、自定义 Markdown 介绍、技术栈、顺序、精选、仓库/文档/下载/演示链接 |
| 文章与日常 | 长文章和随笔共用一种形式；短动态标题可选、直接展示正文和配图；统一按首次发布时间倒序 |
| 编辑器 | Markdown 并排预览、常用格式按钮、插图、封面、配图、摘要提取、Ctrl/⌘+S、离开时提醒未保存修改 |
| 发布 | 草稿、发布、修改、撤回、删除；草稿不出现在公开详情、列表、搜索和互动接口中 |
| 搜索 | 搜索已发布作品、文章、动态的标题、摘要、正文、仓库名称及描述；支持中文和分页 |
| GitHub | 读取配置用户的公开仓库、勾选导入草稿、防重复导入、手动同步、每日同步 |
| 图片库 | 真实图片检查、上传、选择、预览、复制地址、删除；已有内容或站点信息引用的图片拒绝删除 |
| 互动 | 匿名浏览器 Cookie 点赞一次/取消；浏览 30 分钟去重；短动态卡片进入视野也计浏览 |
| 后台 | 账号密码登录、工作台统计、内容管理、图片库、站点设置、修改密码、退出登录 |
| 公开页面 | 电脑和手机适配、主题切换、独立链接、图片放大、404 和错误重试 |

不包含评论、留言、访客账号、私密文章、视频和附件、日常备份功能。后台按桌面设计。

## 默认规则与可调整项

- **文章没有分类体系。** 可选「内容标记」只是一段展示文字，例如“技术笔记”“生活随笔”，不影响统一列表和搜索。
- **发布时间**：首次发布时生成；撤回再发布保留原时间，编辑不会把旧文顶到最新位置。
- **精选作品**：首页最多四个，以紧凑的横向卡片逐行展示，手机上卡片内部改为上下排列；优先展示精选作品，不足四个时以其他已发布作品补齐，组内按 `sort_order` 排序。
- **搜索**：第一版使用参数化 SQL 的子串匹配，字面处理 `%`、`_`。按当前个人站内容量设计，暂不引入全文索引或搜索进程。
- **图片**：JPG、PNG、GIF，每张最多 8MB、1600 万像素、单边最多 8192。重新编码并移除附加元数据；**GIF 仅保留首帧**。每条内容最多九张配图，正文内还可插图。不接受 SVG。图片不自动生成多尺寸缩略图。
- **浏览与点赞**：通过 HttpOnly 随机 Cookie 区分浏览器，不是精确人数，也不防恶意刷量；清除 Cookie 或换浏览器会成为新访客。只保存 Cookie 的哈希作为去重依据。过期浏览去重记录自动清理，累计数字保留。
- **GitHub 信息**：同步 `name / description / language / pushed_at / html_url`；`pushed_at` 表示最近推送时间。它们与手写标题、摘要、正文、技术栈、展示顺序、精选、发布状态分开保存，不互相覆盖。
- **GitHub 时间**：默认上海时间每日 04:00 后运行一次；服务在该时刻未运行，会在当天稍后启动时补执行。同日手动同步也算当天已同步。用 `.env` 的 `TIMEZONE`、`GITHUB_SYNC_HOUR` 调整。
- **GitHub 失败**：单个仓库失败时保留原信息并显示错误；自动同步结果可在工作台查看日期和失败数。网络或 GitHub 限额不影响已经保存的公开作品。可通过仅存在后端的 `GITHUB_TOKEN` 增加访问限额。
- **搜索引擎**：HTML `noindex`、Go 响应头 `X-Robots-Tag`、`robots.txt` 禁止抓取，不生成站点地图。它们是爬虫声明，不是访问权限，页面仍可通过链接公开访问。
- **管理员**：密码使用 bcrypt；会话存在数据库中，默认 12 小时。修改或重置密码后撤销所有会话；写入接口验证 CSRF，登录接口限制失败重试。

## 构建与运行配置

```text
frontend: npm ci && npm run build
backend:  go build -o bin/thirteenash ./cmd/server
backend:  ./bin/thirteenash serve
```

Go 会从 `FRONTEND_DIR` 提供构建后的静态前端、从 `UPLOAD_DIR` 提供图片，并支持 Vue 路由刷新。路径默认相对于后端工作目录。若之后由宝塔的网站服务单独提供前端，需要保留 Vue 路由回退，并将 `/api/`、`/uploads/` 转发到 Go。

部署由你自行安排；把 `PUBLIC_URL` 设置成实际站点地址，HTTPS 下设置 `COOKIE_SECURE=true`。环境变量优先于 `.env`；生产数据库使用本站独立账号。源码、`.env` 和上传目录均不应放进前端静态目录。

忘记管理员密码时，在 `backend/.env` 中设置要重置的 `ADMIN_USERNAME`、新的 `ADMIN_PASSWORD`，执行：

```text
go run ./cmd/server reset-password
```

服务运行时不会从 `.env` 的 `ADMIN_PASSWORD` 自动更新密码；这项配置只在首次初始化或显式重置时使用。

## 测试

```powershell
# 前端类型检查与正式构建
npm --prefix frontend run build

# 后端：在项目根目录，默认只跑无需 MySQL 的测试
.\scripts\go.ps1 test -v ./...

# MySQL 集成测试：从 backend/.env 读取连接，新建随机测试库，用后删除
$env:TEST_MYSQL = '1'
.\scripts\go.ps1 test -count=1 -v ./...
Remove-Item Env:TEST_MYSQL

# 先运行前后端，再从 frontend 运行浏览器测试（默认本机 Edge）
npm --prefix frontend run test:e2e
```

MySQL 集成测试需要创建/删除临时测试库的权限，不使用已有业务库。覆盖权限、草稿隐藏、中文搜索、发布撤回、并发点赞、浏览去重、伪造文件拒绝、图片引用保护、GitHub 导入去重与同步字段保护、密码修改及静态路由。

浏览器测试从 `backend/.env` 或进程环境读取管理员凭证，不内置密码；测试会临时创建文章和图片并在结束时清理，临时修改的简介会还原。包含真实 GitHub 读取和同步，因此需要网络；其余 GitHub 失败分支由后端模拟服务测试覆盖。默认使用 <http://127.0.0.1:5173/>，可用 `E2E_BASE_URL` 改成构建后的 8080 地址。其他系统可设置 `PLAYWRIGHT_CHANNEL=chromium` 并执行 `npx playwright install chromium`。

代码结构和数据库关系见 [docs/architecture.md](docs/architecture.md)。
