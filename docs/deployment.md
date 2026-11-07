# 生产部署说明

部署日期：2026-11-06。

## 访问地址

- 网站：https://thirteenash.bytecraft.xin
- 后台：https://thirteenash.bytecraft.xin/admin/login
- 健康检查：https://thirteenash.bytecraft.xin/api/health

域名 A 记录已指向 `8.137.151.20`，HTTP 自动跳转 HTTPS。
后台保留部署前本地数据库中的 `admin` 账号及密码，登录会话不迁移。

## 宝塔管理

在宝塔的「网站 → Go 项目」中管理 `thirteenash`，支持启动、停止、重启和查看日志，已启用开机启动。
数据库也已登记到宝塔，并关联到该站点。

| 项目 | 位置或配置 |
| --- | --- |
| 服务器 | `8.137.151.20` |
| 宝塔站点 ID | `10` |
| 运行用户 | `www` |
| 项目目录 | `/www/wwwroot/thirteenash` |
| 后端程序 | `/www/wwwroot/thirteenash/thirteenash` |
| 启动命令 | `/www/wwwroot/thirteenash/thirteenash serve` |
| 工作目录 | `/www/wwwroot/thirteenash` |
| 后端监听 | `127.0.0.1:18081` |
| 前端文件 | `/www/wwwroot/thirteenash/frontend` |
| 图片目录 | `/www/wwwroot/thirteenash/uploads` |
| 环境配置 | `/www/wwwroot/thirteenash/.env` |
| MySQL 库名与用户 | `thirteenash` |
| Nginx 配置 | `/www/server/panel/vhost/nginx/go_thirteenash.conf` |
| 应用日志 | `/www/wwwlogs/go/thirteenash.log` |
| 访问日志 | `/www/wwwlogs/thirteenash.log` |
| SSL 证书 | `/www/server/panel/vhost/cert/thirteenash/` |

数据库使用独立随机密码，存储在服务器配置和宝塔数据库管理中。生产环境启用 `COOKIE_SECURE=true`。
Let's Encrypt 证书已登记到宝塔续期管理；HTTP 验证目录为 `/www/wwwroot/java_node_ssl`。
首次签发证书有效期至 2027-02-04，后续由宝塔续期。

## 数据与更新

首次部署迁移了本地 9 条内容、3 张上传图片、站点设置、管理员以及已有互动记录。
首次部署的数据快照和程序包保存在服务器 `/root/thirteenash-deploy/`，仅 root 可访问；这份快照不随线上数据变化自动更新。

更新前先备份线上数据库、`.env` 和 `uploads/`。重新构建前端和 Linux amd64 后端，仅替换程序及前端文件，保留线上配置和图片。
如有数据库结构升级，在项目工作目录执行 `./thirteenash init`，再通过宝塔重启该 Go 项目。
不要用首次部署快照覆盖已有线上数据。

## 已完成验证

- 前端类型检查与生产构建，Go 单元测试与 `go vet`。
- 公网 HTTPS 首页、作品页、后台登录页和 API 响应，HTTP 跳转。
- 迁移数据条数一致，未登录后台接口返回 401，`.env` 请求返回 404。
- 浏览器首页 11 个图片元素均成功解码，无页面脚本错误；手机宽度检查无横向溢出。
- 通过宝塔重启后服务健康检查正常。

后台账号密码保持原样；本次未使用管理员密码执行实际登录验证。
