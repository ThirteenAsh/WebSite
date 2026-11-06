# Go 后端

在本目录启动开发服务：

```text
go run ./cmd/server serve
```

默认监听 `127.0.0.1:8080`，Vue 开发服务器通过代理访问接口。配置读取本目录 `.env`，图片默认保存在 `uploads/`。修改 Go 代码后需要停止并重新运行。

首次初始化和维护命令：

```text
go run ./cmd/server init
go run ./cmd/server reset-password
go test ./...
go vet ./...
go build -o bin/thirteenash ./cmd/server
```

`init` 可重复执行；日常启动只用 `serve`。真实数据库测试需显式设置 `TEST_MYSQL=1`，会创建随机临时测试库并清理。

升级已有站点时先执行 `go run ./cmd/server init`，再重新启动后端。迁移会扩展内容标记的容量，保留原有单标签和已有内容；内容标记、仓库主要语言均支持每行一项。

程序入口为 `cmd/server/main.go`，内部实现位于 `internal/`，初始 SQL 位于 `migrations/001_init.sql`。详细目录和依赖方向见 [架构说明](../docs/architecture.md)，完整前后端启动说明见 [项目说明](../README.md)。
