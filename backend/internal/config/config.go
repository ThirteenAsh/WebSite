// Package config loads the application's environment configuration.
package config

import (
	"errors"
	"os"
	"strconv"
	"time"
	_ "time/tzdata"

	"github.com/joho/godotenv"
)

type Database struct {
	Host     string
	Port     int
	User     string
	Password string
	Name     string
	MaxOpen  int
}

type Admin struct{ Username, Password string }

type Server struct {
	Addr, UploadDir, FrontendDir, PublicURL string
	Secure                                  bool
	SyncHour                                int
	Location                                *time.Location
}

type Config struct {
	Database    Database
	Admin       Admin
	Server      Server
	GitHubToken string
}

func env(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

// Load reads envFile without replacing existing process environment variables.
// Relative paths in the configuration are relative to the working directory.
func Load(envFile string) (Config, error) {
	var cfg Config
	if err := godotenv.Load(envFile); err != nil && !os.IsNotExist(err) {
		return cfg, err
	}
	port, err := strconv.Atoi(env("DB_PORT", "3306"))
	if err != nil || port < 1 || port > 65535 {
		return cfg, errors.New("DB_PORT 无效")
	}
	name := env("DB_NAME", "thirteenash")
	if name == "" {
		return cfg, errors.New("DB_NAME 不能为空")
	}
	for _, r := range name {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '_') {
			return cfg, errors.New("DB_NAME 只能包含字母、数字和下划线")
		}
	}
	max, err := strconv.Atoi(env("DB_MAX_OPEN", "5"))
	if err != nil || max < 1 || max > 50 {
		max = 5
	}
	location, err := time.LoadLocation(env("TIMEZONE", "Asia/Shanghai"))
	if err != nil {
		return cfg, err
	}
	hour, err := strconv.Atoi(env("GITHUB_SYNC_HOUR", "4"))
	if err != nil || hour < 0 || hour > 23 {
		return cfg, errors.New("GITHUB_SYNC_HOUR 必须为 0–23")
	}
	cfg.Database = Database{Host: env("DB_HOST", "127.0.0.1"), Port: port, User: env("DB_USER", "thirteenash"), Password: os.Getenv("DB_PASSWORD"), Name: name, MaxOpen: max}
	cfg.Admin = Admin{Username: env("ADMIN_USERNAME", "admin"), Password: os.Getenv("ADMIN_PASSWORD")}
	cfg.Server = Server{Addr: env("HTTP_ADDR", "127.0.0.1:8080"), UploadDir: env("UPLOAD_DIR", "./uploads"), FrontendDir: env("FRONTEND_DIR", "../frontend/dist"), PublicURL: env("PUBLIC_URL", ""), Secure: env("COOKIE_SECURE", "false") == "true", SyncHour: hour, Location: location}
	cfg.GitHubToken = os.Getenv("GITHUB_TOKEN")
	return cfg, nil
}
