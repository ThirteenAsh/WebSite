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
