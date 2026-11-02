package config

import (
	"os"
	"path/filepath"
	"testing"
)

func baseEnvironment(t *testing.T) {
	t.Helper()
	for key, value := range map[string]string{"DB_PORT": "3306", "DB_NAME": "thirteenash", "DB_MAX_OPEN": "5", "TIMEZONE": "Asia/Shanghai", "GITHUB_SYNC_HOUR": "4"} {
		t.Setenv(key, value)
	}
}

func TestLoadEnvironmentPrecedence(t *testing.T) {
	baseEnvironment(t)
	t.Setenv("HTTP_ADDR", "127.0.0.1:18080")
	t.Setenv("DB_HOST", "process-host")
	file := filepath.Join(t.TempDir(), ".env")
	if err := os.WriteFile(file, []byte("HTTP_ADDR=127.0.0.1:8080\nDB_HOST=file-host\nDB_NAME=other_database\n"), 0600); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load(file)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Server.Addr != "127.0.0.1:18080" || cfg.Database.Host != "process-host" || cfg.Database.Name != "thirteenash" {
		t.Fatal("环境变量应优先于配置文件")
	}
}

func TestLoadValidation(t *testing.T) {
	for _, tc := range []struct{ name, key, value string }{
		{"数据库端口", "DB_PORT", "70000"},
		{"数据库名", "DB_NAME", "unsafe`database"},
		{"时区", "TIMEZONE", "not-a-timezone"},
		{"同步小时", "GITHUB_SYNC_HOUR", "24"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			baseEnvironment(t)
			t.Setenv(tc.key, tc.value)
			if _, err := Load(filepath.Join(t.TempDir(), "missing.env")); err == nil {
				t.Fatal("无效配置应返回错误")
			}
		})
	}
}
