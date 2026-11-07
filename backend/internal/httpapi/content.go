package httpapi

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"thirteenash/internal/model"
	"thirteenash/internal/repository"
)

func (a *Server) publicSite(w http.ResponseWriter, r *http.Request) {
	s, e := a.settings(r.Context())
	if e != nil {
		serverError(w, e)
		return
	}
	var projects, articles, moments int
	e = a.db.QueryRowContext(r.Context(), `SELECT COALESCE(SUM(kind='project'),0),COALESCE(SUM(kind='article'),0),COALESCE(SUM(kind='moment'),0) FROM contents WHERE status='published'`).Scan(&projects, &articles, &moments)
	if e != nil {
		serverError(w, e)
		return
	}
	jsonResponse(w, 200, map[string]any{"settings": s, "counts": map[string]int{"projects": projects, "articles": articles, "moments": moments, "writings": articles + moments}})
}

func (a *Server) listPublic(w http.ResponseWriter, r *http.Request) { a.listContents(w, r, false) }
func (a *Server) listAdmin(w http.ResponseWriter, r *http.Request)  { a.listContents(w, r, true) }
func (a *Server) listContents(w http.ResponseWriter, r *http.Request, admin bool) {
	where := []string{"1=1"}
	args := []any{}
	if !admin {
		where = append(where, "status='published'")
	} else if status := r.URL.Query().Get("status"); status != "" {
		where = append(where, "status=?")
		args = append(args, status)
	}
	if kind := r.URL.Query().Get("kind"); kind != "" {
		if kind == "writing" {
			where = append(where, "kind IN ('article','moment')")
		} else {
			where = append(where, "kind=?")
			args = append(args, kind)
		}
	}
	if r.URL.Query().Get("featured") == "1" {
		where = append(where, "featured=1 AND kind='project'")
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if utf8.RuneCountInString(q) > 100 {
		fail(w, 400, "搜索词最多 100 字")
		return
	}
	if q != "" {
		pattern := "%" + strings.NewReplacer("=", "==", "%", "=%", "_", "=_").Replace(q) + "%"
		where = append(where, `(title LIKE ? ESCAPE '=' OR summary LIKE ? ESCAPE '=' OR body LIKE ? ESCAPE '=' OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(repo_overrides,'$.name')),repo_name) LIKE ? ESCAPE '=' OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(repo_overrides,'$.description')),repo_description) LIKE ? ESCAPE '=')`)
		for i := 0; i < 5; i++ {
			args = append(args, pattern)
		}
	}
	clause := strings.Join(where, " AND ")
	var total int
	if e := a.db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM contents WHERE "+clause, args...).Scan(&total); e != nil {
		serverError(w, e)
		return
	}
	page := intQuery(r, "page", 1, 1, 1000000)
	limit := intQuery(r, "limit", 12, 1, 100)
	order := "published_at DESC,id DESC"
	if r.URL.Query().Get("kind") == "project" {
		order = "sort_order ASC,published_at DESC,id DESC"
	} else if admin {
		order = "updated_at DESC,id DESC"
	}
	values := append(append([]any{}, args...), limit, (page-1)*limit)
	rows, e := a.db.QueryContext(r.Context(), "SELECT "+repository.ContentColumns+" FROM contents WHERE "+clause+" ORDER BY "+order+" LIMIT ? OFFSET ?", values...)
	if e != nil {
		serverError(w, e)
		return
	}
	defer rows.Close()
	items := []model.Content{}
	for rows.Next() {
		c, e := repository.ScanContent(rows)
		if e != nil {
			serverError(w, e)
			return
		}
		if c.Kind != "moment" {
			if !admin && c.Kind == "article" && r.URL.Query().Get("preview") == "1" {
				// 首页只取一段正文，完整正文仍通过详情接口读取。
				runes := []rune(c.Body)
				c.BodyPreview = string(runes[:min(len(runes), 2000)])
			}
			c.Body = ""
		}
		items = append(items, c)
	}
	if e = rows.Err(); e != nil {
		serverError(w, e)
		return
	}
	// 单独查询点赞，不在保持 rows 打开的情况下嵌套查询，避免小连接池死锁。
	rows.Close()
	if hash := visitorHash(r); hash != "" && !admin {
		for i := range items {
			var n int
			if e = a.db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM content_likes WHERE content_id=? AND visitor_hash=?", items[i].ID, hash).Scan(&n); e != nil {
				serverError(w, e)
				return
			}
			items[i].Liked = n > 0
		}
	}
	jsonResponse(w, 200, map[string]any{"items": items, "total": total, "page": page, "limit": limit, "pages": (total + limit - 1) / limit})
}
func (a *Server) getPublic(w http.ResponseWriter, r *http.Request) { a.getContent(w, r, false) }
func (a *Server) getAdmin(w http.ResponseWriter, r *http.Request)  { a.getContent(w, r, true) }
func (a *Server) getContent(w http.ResponseWriter, r *http.Request, admin bool) {
	id, ok := contentID(w, r)
	if !ok {
		return
	}
	query := "SELECT " + repository.ContentColumns + " FROM contents WHERE id=?"
	if !admin {
		query += " AND status='published'"
	}
	c, e := repository.ScanContent(a.db.QueryRowContext(r.Context(), query, id))
	if errors.Is(e, sql.ErrNoRows) {
		fail(w, 404, "内容不存在或尚未发布")
		return
	}
	if e != nil {
		serverError(w, e)
		return
	}
	if hash := visitorHash(r); hash != "" && !admin {
		var n int
		if e = a.db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM content_likes WHERE content_id=? AND visitor_hash=?", id, hash).Scan(&n); e != nil {
			serverError(w, e)
			return
		}
		c.Liked = n > 0
	}
	jsonResponse(w, 200, c)
}
func (a *Server) createContent(w http.ResponseWriter, r *http.Request) {
	var input contentInput
	if !decode(w, r, &input) {
		return
	}
	c := input.content()
	if e := validateContent(&c); e != nil {
		fail(w, 400, e.Error())
		return
	}
	// 仓库关联仅能通过 GitHub 导入，客户端不能伪造同步来源。
	c.RepoID = nil
	c.RepoFullName = ""
	c.RepoName = ""
	c.RepoDescription = ""
	c.RepoLanguage = ""
	c.RepoURL = ""
	c.RepoUpdatedAt = nil
	if c.Status == "published" {
		now := time.Now().UTC()
		c.PublishedAt = &now
	} else {
		c.PublishedAt = nil
	}
	if len(input.UploadIDs) > 1000 {
		fail(w, 400, "首次保存最多归类 1000 张图片")
		return
	}
	ctx := r.Context()
	tx, e := a.db.BeginTx(ctx, nil)
	if e != nil {
		serverError(w, e)
		return
	}
	defer tx.Rollback()
	id, e := repository.InsertContent(ctx, tx, c)
	if e != nil {
		serverError(w, e)
		return
	}
	if len(input.UploadIDs) > 0 {
		args := []any{id}
		for _, uploadID := range input.UploadIDs {
			args = append(args, uploadID)
		}
		params := strings.Repeat("?,", len(input.UploadIDs)-1) + "?"
		if _, e = tx.ExecContext(ctx, "UPDATE uploads SET content_id=? WHERE content_id IS NULL AND id IN ("+params+")", args...); e != nil {
			serverError(w, e)
			return
		}
	}
	if e = tx.Commit(); e != nil {
		serverError(w, e)
		return
	}
	jsonResponse(w, 201, map[string]int64{"id": id})
}
func (a *Server) updateContent(w http.ResponseWriter, r *http.Request) {
	id, ok := contentID(w, r)
	if !ok {
		return
	}
	var input contentInput
	if !decode(w, r, &input) {
		return
	}
	c := input.content()
	if e := validateContent(&c); e != nil {
		fail(w, 400, e.Error())
		return
	}
	tx, e := a.db.BeginTx(r.Context(), nil)
	if e != nil {
		serverError(w, e)
		return
	}
	defer tx.Rollback()
	var kind string
	var published *time.Time
	e = tx.QueryRowContext(r.Context(), "SELECT kind,published_at FROM contents WHERE id=? FOR UPDATE", id).Scan(&kind, &published)
	if errors.Is(e, sql.ErrNoRows) {
		fail(w, 404, "内容不存在")
		return
	}
	if e != nil {
		serverError(w, e)
		return
	}
	if kind != c.Kind {
		fail(w, 400, "已有内容不能更改形式，请新建内容")
		return
	}
	if c.Status == "published" && published == nil {
		now := time.Now().UTC()
		published = &now
	}
	images, _ := json.Marshal(c.Images)
	stack, _ := json.Marshal(c.TechStack)
	overrides, _ := json.Marshal(c.RepoOverrides)
	_, e = tx.ExecContext(r.Context(), `UPDATE contents SET label=?,title=?,summary=?,body=?,cover_url=?,images=?,tech_stack=?,status=?,featured=?,sort_order=?,demo_url=?,docs_url=?,release_url=?,published_at=?,repo_overrides=IF(?, ?, repo_overrides) WHERE id=?`, c.Label, c.Title, c.Summary, c.Body, c.CoverURL, images, stack, c.Status, c.Featured, c.SortOrder, c.DemoURL, c.DocsURL, c.ReleaseURL, published, input.RepoOverrides != nil, overrides, id)
	if e != nil {
		serverError(w, e)
		return
	}
	if e = tx.Commit(); e != nil {
		serverError(w, e)
		return
	}
	jsonResponse(w, 200, map[string]int64{"id": id})
}
func (a *Server) deleteContent(w http.ResponseWriter, r *http.Request) {
	id, ok := contentID(w, r)
	if !ok {
		return
	}
	result, e := a.db.ExecContext(r.Context(), "DELETE FROM contents WHERE id=?", id)
	if e != nil {
		serverError(w, e)
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		fail(w, 404, "内容不存在")
		return
	}
	jsonResponse(w, 200, map[string]bool{"ok": true})
}

func (a *Server) recordView(w http.ResponseWriter, r *http.Request) {
	id, ok := contentID(w, r)
	if !ok {
		return
	}
	hash := a.withVisitor(w, r)
	tx, e := a.db.BeginTx(r.Context(), nil)
	if e != nil {
		serverError(w, e)
		return
	}
	defer tx.Rollback()
	var count int64
	e = tx.QueryRowContext(r.Context(), "SELECT view_count FROM contents WHERE id=? AND status='published' FOR UPDATE", id).Scan(&count)
	if errors.Is(e, sql.ErrNoRows) {
		fail(w, 404, "内容不存在")
		return
	}
	if e != nil {
		serverError(w, e)
		return
	}
	var last time.Time
	e = tx.QueryRowContext(r.Context(), "SELECT last_view_at FROM content_views WHERE content_id=? AND visitor_hash=?", id, hash).Scan(&last)
	if e != nil && !errors.Is(e, sql.ErrNoRows) {
		serverError(w, e)
		return
	}
	counted := e != nil || time.Since(last) >= 30*time.Minute
	if counted {
		if _, e = tx.ExecContext(r.Context(), "INSERT INTO content_views(content_id,visitor_hash,last_view_at) VALUES(?,?,UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE last_view_at=UTC_TIMESTAMP(6)", id, hash); e != nil {
			serverError(w, e)
			return
		}
		if _, e = tx.ExecContext(r.Context(), "UPDATE contents SET view_count=view_count+1,updated_at=updated_at WHERE id=?", id); e != nil {
			serverError(w, e)
			return
		}
		count++
	}
	if e = tx.Commit(); e != nil {
		serverError(w, e)
		return
	}
	jsonResponse(w, 200, map[string]any{"view_count": count, "counted": counted})
}
func (a *Server) setLike(w http.ResponseWriter, r *http.Request) {
	id, ok := contentID(w, r)
	if !ok {
		return
	}
	var body struct {
		Liked *bool `json:"liked"`
	}
	if !decode(w, r, &body) {
		return
	}
	if body.Liked == nil {
		fail(w, 400, "缺少 liked 字段")
		return
	}
	hash := a.withVisitor(w, r)
	tx, e := a.db.BeginTx(r.Context(), nil)
	if e != nil {
		serverError(w, e)
		return
	}
	defer tx.Rollback()
	var count int64
	e = tx.QueryRowContext(r.Context(), "SELECT like_count FROM contents WHERE id=? AND status='published' FOR UPDATE", id).Scan(&count)
	if errors.Is(e, sql.ErrNoRows) {
		fail(w, 404, "内容不存在")
		return
	}
	if e != nil {
		serverError(w, e)
		return
	}
	var result sql.Result
	if *body.Liked {
		result, e = tx.ExecContext(r.Context(), "INSERT IGNORE INTO content_likes(content_id,visitor_hash) VALUES(?,?)", id, hash)
	} else {
		result, e = tx.ExecContext(r.Context(), "DELETE FROM content_likes WHERE content_id=? AND visitor_hash=?", id, hash)
	}
	if e != nil {
		serverError(w, e)
		return
	}
	n, _ := result.RowsAffected()
	if n > 0 {
		if *body.Liked {
			count++
		} else if count > 0 {
			count--
		}
		if _, e = tx.ExecContext(r.Context(), "UPDATE contents SET like_count=?,updated_at=updated_at WHERE id=?", count, id); e != nil {
			serverError(w, e)
			return
		}
	}
	if e = tx.Commit(); e != nil {
		serverError(w, e)
		return
	}
	jsonResponse(w, 200, map[string]any{"liked": *body.Liked, "like_count": count})
}
