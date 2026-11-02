// Package bootstrap initializes the administrator and legacy site content.
package bootstrap

import (
	"bufio"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"strings"

	"golang.org/x/crypto/bcrypt"

	"thirteenash/internal/config"
)

func credentials(cfg config.Admin) (string, string, error) {
	username, password := cfg.Username, cfg.Password
	if password == "" {
		fmt.Print("请输入管理员新密码（至少 12 字符）: ")
		line, err := bufio.NewReader(os.Stdin).ReadString('\n')
		if err != nil {
			return "", "", err
		}
		password = strings.TrimSpace(line)
	}
	if len(username) < 1 || len(username) > 80 || len(password) < 12 || len(password) > 72 {
		return "", "", errors.New("管理员账号为 1–80 字符，密码为 12–72 字节")
	}
	return username, password, nil
}

func Initialize(db *sql.DB, cfg config.Admin) error {
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM admins").Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		username, password, err := credentials(cfg)
		if err != nil {
			return err
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
		if err != nil {
			return err
		}
		if _, err = db.Exec("INSERT INTO admins(username,password_hash) VALUES(?,?)", username, string(hash)); err != nil {
			return err
		}
	}
	return SeedDefaults(db)
}

func ResetPassword(db *sql.DB, cfg config.Admin) error {
	username, password, err := credentials(cfg)
	if err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return err
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.Exec("UPDATE admins SET password_hash=? WHERE username=?", string(hash), username)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return errors.New("管理员不存在")
	}
	if _, err = tx.Exec("DELETE FROM sessions WHERE admin_id=(SELECT id FROM admins WHERE username=?)", username); err != nil {
		return err
	}
	return tx.Commit()
}
