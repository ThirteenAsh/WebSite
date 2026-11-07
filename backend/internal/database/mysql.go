// Package database manages the MySQL connection pool and schema initialization.
package database

import (
	"context"
	"database/sql"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"

	"thirteenash/internal/config"
	"thirteenash/migrations"
)

func Open(cfg config.Database, create bool) (*sql.DB, error) {
	c := mysql.NewConfig()
	c.User = cfg.User
	c.Passwd = cfg.Password
	c.Net = "tcp"
	c.Addr = net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port))
	c.ParseTime = true
	c.Loc = time.UTC
	c.Timeout = 5 * time.Second
	c.ReadTimeout = 30 * time.Second
	c.WriteTimeout = 30 * time.Second
	c.Params = map[string]string{"charset": "utf8mb4", "time_zone": "'+00:00'"}
	if create {
		db, err := sql.Open("mysql", c.FormatDSN())
		if err != nil {
			return nil, err
		}
		_, err = db.Exec("CREATE DATABASE IF NOT EXISTS `" + cfg.Name + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
		db.Close()
		if err != nil {
			return nil, err
		}
	}
	c.DBName = cfg.Name
	db, err := sql.Open("mysql", c.FormatDSN())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(cfg.MaxOpen)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(3 * time.Minute)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err = db.PingContext(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func Migrate(db *sql.DB) error {
	if err := executeSchema(db, migrations.InitialSchema); err != nil {
		return err
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='contents' AND column_name='repo_overrides'`).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		if err := executeSchema(db, migrations.RepoOverridesSchema); err != nil {
			return err
		}
	}
	var labelLength int64
	if err := db.QueryRow(`SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='contents' AND column_name='label'`).Scan(&labelLength); err != nil {
		return err
	}
	if labelLength < 1000 {
		if err := executeSchema(db, migrations.MultilineLabelsSchema); err != nil {
			return err
		}
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='uploads' AND column_name='content_id'`).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		return executeSchema(db, migrations.UploadGroupsSchema)
	}
	return nil
}

func executeSchema(db *sql.DB, schema string) error {
	// 初始脚本不含存储过程或字符串分号，逐条执行不启用 multiStatements。
	var lines []string
	for _, line := range strings.Split(schema, "\n") {
		if !strings.HasPrefix(strings.TrimSpace(line), "--") {
			lines = append(lines, line)
		}
	}
	for _, statement := range strings.Split(strings.Join(lines, "\n"), ";") {
		if strings.TrimSpace(statement) != "" {
			if _, err := db.Exec(statement); err != nil {
				return err
			}
		}
	}
	return nil
}
