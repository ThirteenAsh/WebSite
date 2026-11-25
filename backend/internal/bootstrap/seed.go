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
	s := model.DefaultSiteSettings()
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
