package repository

import (
	"context"
	"database/sql"
	"encoding/json"

	"thirteenash/internal/model"
)

const ContentColumns = `id,kind,label,title,summary,body,cover_url,images,tech_stack,status,featured,sort_order,repo_id,repo_full_name,repo_name,repo_description,repo_language,repo_url,repo_updated_at,demo_url,docs_url,release_url,view_count,like_count,published_at,created_at,updated_at`

type scanner interface{ Scan(...any) error }

func ScanContent(row scanner) (model.Content, error) {
	var c model.Content
	var images, stack []byte
	err := row.Scan(&c.ID, &c.Kind, &c.Label, &c.Title, &c.Summary, &c.Body, &c.CoverURL, &images, &stack, &c.Status, &c.Featured, &c.SortOrder, &c.RepoID, &c.RepoFullName, &c.RepoName, &c.RepoDescription, &c.RepoLanguage, &c.RepoURL, &c.RepoUpdatedAt, &c.DemoURL, &c.DocsURL, &c.ReleaseURL, &c.ViewCount, &c.LikeCount, &c.PublishedAt, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return c, err
	}
	if err = json.Unmarshal(images, &c.Images); err != nil {
		return c, err
	}
	if err = json.Unmarshal(stack, &c.TechStack); err != nil {
		return c, err
	}
	if c.Images == nil {
		c.Images = []string{}
	}
	if c.TechStack == nil {
		c.TechStack = []string{}
	}
	return c, nil
}

func InsertContent(ctx context.Context, db interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}, c model.Content) (int64, error) {
	images, _ := json.Marshal(c.Images)
	stack, _ := json.Marshal(c.TechStack)
	result, e := db.ExecContext(ctx, `INSERT INTO contents(kind,label,title,summary,body,cover_url,images,tech_stack,status,featured,sort_order,repo_id,repo_full_name,repo_name,repo_description,repo_language,repo_url,repo_updated_at,demo_url,docs_url,release_url,published_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, c.Kind, c.Label, c.Title, c.Summary, c.Body, c.CoverURL, images, stack, c.Status, c.Featured, c.SortOrder, c.RepoID, c.RepoFullName, c.RepoName, c.RepoDescription, c.RepoLanguage, c.RepoURL, c.RepoUpdatedAt, c.DemoURL, c.DocsURL, c.ReleaseURL, c.PublishedAt)
	if e != nil {
		return 0, e
	}
	return result.LastInsertId()
}
func Settings(ctx context.Context, db *sql.DB) (model.SiteSettings, error) {
	var s model.SiteSettings
	var raw []byte
	err := db.QueryRowContext(ctx, "SELECT payload FROM settings WHERE id=1").Scan(&raw)
	if err != nil {
		return s, err
	}
	err = json.Unmarshal(raw, &s)
	return s, err
}
