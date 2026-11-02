// Package app wires dependencies and handles server and maintenance commands.
package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"thirteenash/internal/bootstrap"
	"thirteenash/internal/config"
	"thirteenash/internal/database"
	"thirteenash/internal/github"
	"thirteenash/internal/httpapi"
	"thirteenash/internal/repository"
)

func Run(args []string) error {
	command := "serve"
	if len(args) > 0 {
		command = args[0]
	}
	if len(args) > 1 || command != "serve" && command != "init" && command != "reset-password" {
		return errors.New("用法: go run ./cmd/server [serve|init|reset-password]")
	}
	cfg, err := config.Load(".env")
	if err != nil {
		return err
	}
	db, err := database.Open(cfg.Database, command == "init")
	if err != nil {
		return fmt.Errorf("连接数据库失败: %w", err)
	}
	defer db.Close()
	switch command {
	case "init":
		if err = database.Migrate(db); err != nil {
			return err
		}
		if err = bootstrap.Initialize(db, cfg.Admin); err != nil {
			return err
		}
		fmt.Println("数据库结构、管理员和初始作品已初始化；重复执行不会覆盖已有内容。")
		return nil
	case "reset-password":
		if err = bootstrap.ResetPassword(db, cfg.Admin); err != nil {
			return err
		}
		fmt.Println("密码已重置，原登录会话已失效。")
		return nil
	}
	if err = os.MkdirAll(cfg.Server.UploadDir, 0750); err != nil {
		return err
	}
	if _, err = repository.Settings(context.Background(), db); err != nil {
		return fmt.Errorf("请先执行 go run ./cmd/server init 初始化数据库: %w", err)
	}
	api := httpapi.New(db, cfg.Server, github.NewClient(cfg.GitHubToken))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go api.RunScheduler(ctx)
	server := &http.Server{Addr: cfg.Server.Addr, Handler: api.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 120 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 1 << 20}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	log.Printf("ThirteenAsh 已启动 http://%s", cfg.Server.Addr)
	err = server.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}
