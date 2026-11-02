package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"

	"thirteenash/internal/model"
	"thirteenash/internal/repository"
)

func (a *Server) settings(ctx context.Context) (model.SiteSettings, error) {
	return repository.Settings(ctx, a.db)
}

func (a *Server) dashboard(w http.ResponseWriter, r *http.Request) {
	var total, published, drafts, projects, views, likes int64
	e := a.db.QueryRowContext(r.Context(), `SELECT COUNT(*),COALESCE(SUM(status='published'),0),COALESCE(SUM(status='draft'),0),COALESCE(SUM(kind='project'),0),COALESCE(SUM(view_count),0),COALESCE(SUM(like_count),0) FROM contents`).Scan(&total, &published, &drafts, &projects, &views, &likes)
	if e != nil {
		serverError(w, e)
		return
	}
	var sync string
	e = a.db.QueryRowContext(r.Context(), "SELECT state_value FROM app_state WHERE state_key='github_sync'").Scan(&sync)
	if e != nil && !errors.Is(e, sql.ErrNoRows) {
		serverError(w, e)
		return
	}
	jsonResponse(w, 200, map[string]any{"total": total, "published": published, "drafts": drafts, "projects": projects, "views": views, "likes": likes, "github_sync": sync})
}
func (a *Server) getSettings(w http.ResponseWriter, r *http.Request) {
	s, e := a.settings(r.Context())
	if e != nil {
		serverError(w, e)
		return
	}
	jsonResponse(w, 200, s)
}

var githubUsernamePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9-]{0,38}$`)

func (a *Server) saveSettings(w http.ResponseWriter, r *http.Request) {
	var s model.SiteSettings
	if !decode(w, r, &s) {
		return
	}
	if strings.TrimSpace(s.Name) == "" || utf8.RuneCountInString(s.Name) > 80 || !githubUsernamePattern.MatchString(s.GitHubUsername) {
		fail(w, 400, "请填写站点名称和有效的 GitHub 用户名")
		return
	}
	if !validURL(s.AvatarURL, true) || !validURL(s.GitHubURL, false) {
		fail(w, 400, "头像或 GitHub 链接无效")
		return
	}
	for _, v := range []string{s.Tagline, s.HeroTitle, s.HeroHighlight, s.Intro, s.About} {
		if utf8.RuneCountInString(v) > 3000 {
			fail(w, 400, "介绍文字过长")
			return
		}
	}
	if len(s.Skills) > 20 {
		fail(w, 400, "技术方向最多 20 项")
		return
	}
	for _, v := range s.Skills {
		if utf8.RuneCountInString(v) > 80 {
			fail(w, 400, "技术方向文字过长")
			return
		}
	}
	raw, _ := json.Marshal(s)
	if _, e := a.db.ExecContext(r.Context(), "UPDATE settings SET payload=? WHERE id=1", raw); e != nil {
		serverError(w, e)
		return
	}
	jsonResponse(w, 200, s)
}
