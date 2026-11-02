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
	// 初始脚本不含存储过程或字符串分号，逐条执行不启用 multiStatements。
	var lines []string
	for _, line := range strings.Split(migrations.InitialSchema, "\n") {
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
