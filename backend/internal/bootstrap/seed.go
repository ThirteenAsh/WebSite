package bootstrap

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"

	"thirteenash/internal/model"
	"thirteenash/internal/repository"
)

//go:embed data/projects.json
var legacyProjects []byte

func SeedDefaults(db *sql.DB) error {
	s := model.SiteSettings{Name: "ThirteenAsh", Tagline: "构建 · 学习 · 记录", HeroTitle: "把想法写成代码，", HeroHighlight: "把过程留在这里。", Intro: "我只是一个普通的大学生。\n这里整理我的作品，也记录学习和生活中的片刻。", About: "我是 ThirteenAsh，热爱编程。这里是我的个人空间，代码、项目、技术笔记，以及日常里值得留下的小事。", AvatarURL: "/avatar.jpg", GitHubUsername: "ThirteenAsh", GitHubURL: "https://github.com/ThirteenAsh", Skills: []string{"Java / Spring", "Vue / TypeScript", "Rust / Tauri", "Python / AI"}}
	raw, _ := json.Marshal(s)
	tx, e := db.Begin()
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if _, e = tx.Exec("INSERT IGNORE INTO settings(id,payload) VALUES(1,?)", raw); e != nil {
		return e
	}
	var exists int
	if e = tx.QueryRow("SELECT COUNT(*) FROM app_state WHERE state_key='legacy_seed'").Scan(&exists); e != nil {
		return e
	}
	if exists == 0 {
		var items []model.Content
		if e = json.Unmarshal(legacyProjects, &items); e != nil {
			return e
		}
		for _, c := range items {
			var n int
			if e = tx.QueryRow("SELECT COUNT(*) FROM contents WHERE repo_full_name=?", c.RepoFullName).Scan(&n); e != nil {
				return e
			}
			if n == 0 {
				if _, e = repository.InsertContent(context.Background(), tx, c); e != nil {
					return e
				}
			}
		}
		if _, e = tx.Exec("INSERT INTO app_state(state_key,state_value) VALUES('legacy_seed','1')"); e != nil {
			return e
		}
	}
	return tx.Commit()
}
