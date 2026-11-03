package model

import (
	"time"
)

type SiteSettings struct {
	Name           string   `json:"name"`
	Tagline        string   `json:"tagline"`
	HeroTitle      string   `json:"hero_title"`
	HeroHighlight  string   `json:"hero_highlight"`
	Intro          string   `json:"intro"`
	About          string   `json:"about"`
	AvatarURL      string   `json:"avatar_url"`
	GitHubUsername string   `json:"github_username"`
	GitHubURL      string   `json:"github_url"`
	Skills         []string `json:"skills"`
}

type Content struct {
	ID              int64         `json:"id"`
	Kind            string        `json:"kind"`
	Label           string        `json:"label"`
	Title           string        `json:"title"`
	Summary         string        `json:"summary"`
	Body            string        `json:"body"`
	BodyPreview     string        `json:"body_preview,omitempty"`
	CoverURL        string        `json:"cover_url"`
	Images          []string      `json:"images"`
	TechStack       []string      `json:"tech_stack"`
	Status          string        `json:"status"`
	Featured        bool          `json:"featured"`
	SortOrder       int           `json:"sort_order"`
	RepoID          *int64        `json:"repo_id"`
	RepoFullName    string        `json:"repo_full_name"`
	RepoName        string        `json:"repo_name"`
	RepoDescription string        `json:"repo_description"`
	RepoLanguage    string        `json:"repo_language"`
	RepoURL         string        `json:"repo_url"`
	RepoUpdatedAt   *time.Time    `json:"repo_updated_at"`
	RepoOverrides   RepoOverrides `json:"repo_overrides"`
	DemoURL         string        `json:"demo_url"`
	DocsURL         string        `json:"docs_url"`
	ReleaseURL      string        `json:"release_url"`
	ViewCount       int64         `json:"view_count"`
	LikeCount       int64         `json:"like_count"`
	PublishedAt     *time.Time    `json:"published_at"`
	CreatedAt       time.Time     `json:"created_at"`
	UpdatedAt       time.Time     `json:"updated_at"`
	Liked           bool          `json:"liked"`
}

// 空指针表示跟随 GitHub，指向空字符串表示隐藏字段（名称回退到作品标题）。
// 自定义值仅用于展示，不改变用于同步的仓库标识。
type RepoOverrides struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
	Language    *string `json:"language,omitempty"`
	URL         *string `json:"url,omitempty"`
	UpdatedAt   *string `json:"updated_at,omitempty"`
}
