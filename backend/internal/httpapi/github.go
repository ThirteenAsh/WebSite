package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"thirteenash/internal/github"
	"thirteenash/internal/model"
	"thirteenash/internal/repository"
)

func (a *Server) fetchRepos(ctx context.Context) ([]github.Repository, error) {
	s, err := a.settings(ctx)
	if err != nil {
		return nil, err
	}
	return a.github.ListRepos(ctx, s.GitHubUsername)
}

func (a *Server) githubRepos(w http.ResponseWriter, r *http.Request) {
	repos, e := a.fetchRepos(r.Context())
	if e != nil {
		fail(w, 502, e.Error())
		return
	}
	rows, e := a.db.QueryContext(r.Context(), "SELECT repo_full_name FROM contents WHERE kind='project' AND repo_full_name<>''")
	if e != nil {
		serverError(w, e)
		return
	}
	defer rows.Close()
	selected := map[string]bool{}
	for rows.Next() {
		var name string
		if e = rows.Scan(&name); e != nil {
			serverError(w, e)
			return
		}
		selected[strings.ToLower(name)] = true
	}
	if e = rows.Err(); e != nil {
		serverError(w, e)
		return
	}
	for i := range repos {
		repos[i].Selected = selected[strings.ToLower(repos[i].FullName)]
	}
	jsonResponse(w, 200, map[string]any{"items": repos})
}
func (a *Server) importRepos(w http.ResponseWriter, r *http.Request) {
	var body struct {
		IDs []int64 `json:"ids"`
	}
	if !decode(w, r, &body) {
		return
	}
	if len(body.IDs) < 1 || len(body.IDs) > 100 {
		fail(w, 400, "每次请选择 1–100 个仓库")
		return
	}
	repos, e := a.fetchRepos(r.Context())
	if e != nil {
		fail(w, 502, e.Error())
		return
	}
	available := map[int64]github.Repository{}
	for _, repo := range repos {
		available[repo.ID] = repo
	}
	for _, id := range body.IDs {
		if _, ok := available[id]; !ok {
			fail(w, 400, "选择的仓库已不在此用户的公开仓库列表，请刷新后重试")
			return
		}
	}
	tx, e := a.db.BeginTx(r.Context(), nil)
	if e != nil {
		serverError(w, e)
		return
	}
	defer tx.Rollback()
	imported := 0
	skipped := 0
	for _, id := range body.IDs {
		repo := available[id]
		var n int
		if e = tx.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM contents WHERE repo_id=? OR repo_full_name=?", id, repo.FullName).Scan(&n); e != nil {
			serverError(w, e)
			return
		}
		if n > 0 {
			skipped++
			continue
		}
		c := model.Content{Kind: "project", Title: repo.Name, Summary: repo.Description, Body: "", Images: []string{}, TechStack: []string{}, Status: "draft", RepoID: &repo.ID, RepoFullName: repo.FullName, RepoName: repo.Name, RepoDescription: repo.Description, RepoLanguage: repo.Language, RepoURL: repo.HTMLURL, RepoUpdatedAt: repo.PushedAt}
		if repo.Language != "" {
			c.TechStack = []string{repo.Language}
		}
		if _, e = repository.InsertContent(r.Context(), tx, c); e != nil {
			serverError(w, e)
			return
		}
		imported++
	}
	if e = tx.Commit(); e != nil {
		serverError(w, e)
		return
	}
	jsonResponse(w, 200, map[string]int{"imported": imported, "skipped": skipped})
}

type syncResult struct {
	At      time.Time `json:"at"`
	Updated int       `json:"updated"`
	Errors  []string  `json:"errors"`
	Trigger string    `json:"trigger"`
}

var errSyncRunning = errors.New("已有同步任务正在执行，请稍后查看")

func (a *Server) syncRepos(ctx context.Context, trigger string) (syncResult, error) {
	result := syncResult{At: time.Now().UTC(), Errors: []string{}, Trigger: trigger}
	if !a.syncMu.TryLock() {
		return result, errSyncRunning
	}
	defer a.syncMu.Unlock()
	rows, e := a.db.QueryContext(ctx, "SELECT id,repo_full_name FROM contents WHERE kind='project' AND repo_full_name<>''")
	if e != nil {
		return result, e
	}
	type target struct {
		ID   int64
		Name string
	}
	targets := []target{}
	for rows.Next() {
		var t target
		if e = rows.Scan(&t.ID, &t.Name); e != nil {
			rows.Close()
			return result, e
		}
		targets = append(targets, t)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return result, e
	}
	for _, t := range targets {
		if ctx.Err() != nil {
			return result, ctx.Err()
		}
		parts := strings.Split(t.Name, "/")
		if len(parts) != 2 {
			result.Errors = append(result.Errors, t.Name+": 仓库标识无效")
			continue
		}
		repo, e := a.github.GetRepo(ctx, t.Name)
		if e != nil {
			result.Errors = append(result.Errors, t.Name+": "+e.Error())
			continue
		}
		if repo.Private {
			result.Errors = append(result.Errors, t.Name+": 仓库已非公开，保留上次信息")
			continue
		}
		_, e = a.db.ExecContext(ctx, `UPDATE contents SET repo_id=?,repo_full_name=?,repo_name=?,repo_description=?,repo_language=?,repo_url=?,repo_updated_at=?,updated_at=updated_at WHERE id=?`, repo.ID, repo.FullName, repo.Name, repo.Description, repo.Language, repo.HTMLURL, repo.PushedAt, t.ID)
		if e != nil {
			return result, e
		}
		result.Updated++
	}
	raw, _ := json.Marshal(result)
	_, e = a.db.ExecContext(ctx, "INSERT INTO app_state(state_key,state_value) VALUES('github_sync',?) ON DUPLICATE KEY UPDATE state_value=VALUES(state_value)", raw)
	return result, e
}
func (a *Server) manualSync(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 100*time.Second)
	defer cancel()
	result, e := a.syncRepos(ctx, "manual")
	if errors.Is(e, errSyncRunning) {
		fail(w, 409, e.Error())
		return
	}
	if e != nil {
		serverError(w, e)
		return
	}
	jsonResponse(w, 200, result)
}
