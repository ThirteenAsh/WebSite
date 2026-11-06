package httpapi

import (
	"errors"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"thirteenash/internal/model"
)

// 写入请求只接收可编辑字段，系统时间、统计和 GitHub 元数据由服务端维护。
type contentInput struct {
	Kind          string               `json:"kind"`
	Label         string               `json:"label"`
	Title         string               `json:"title"`
	Summary       string               `json:"summary"`
	Body          string               `json:"body"`
	CoverURL      string               `json:"cover_url"`
	Images        []string             `json:"images"`
	TechStack     []string             `json:"tech_stack"`
	Status        string               `json:"status"`
	Featured      bool                 `json:"featured"`
	SortOrder     int                  `json:"sort_order"`
	DemoURL       string               `json:"demo_url"`
	DocsURL       string               `json:"docs_url"`
	ReleaseURL    string               `json:"release_url"`
	RepoOverrides *model.RepoOverrides `json:"repo_overrides"`
}

func (v contentInput) content() model.Content {
	c := model.Content{Kind: v.Kind, Label: v.Label, Title: v.Title, Summary: v.Summary, Body: v.Body, CoverURL: v.CoverURL, Images: v.Images, TechStack: v.TechStack, Status: v.Status, Featured: v.Featured, SortOrder: v.SortOrder, DemoURL: v.DemoURL, DocsURL: v.DocsURL, ReleaseURL: v.ReleaseURL}
	if v.RepoOverrides != nil {
		c.RepoOverrides = *v.RepoOverrides
	}
	return c
}

func validURL(value string, image bool) bool {
	if value == "" {
		return true
	}
	if len(value) > 1000 {
		return false
	}
	if image && strings.HasPrefix(value, "/") && !strings.HasPrefix(value, "//") && !strings.ContainsAny(value, "\\\r\n") {
		u, e := url.Parse(value)
		return e == nil && u.Host == ""
	}
	u, e := url.Parse(value)
	return e == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Host != "" && u.User == nil
}

func validateContent(c *model.Content) error {
	c.Title = strings.TrimSpace(c.Title)
	c.Summary = strings.TrimSpace(c.Summary)
	c.Label = strings.TrimSpace(c.Label)
	if c.Kind != "project" && c.Kind != "article" && c.Kind != "moment" {
		return errors.New("内容形式无效")
	}
	if c.Status != "draft" && c.Status != "published" {
		return errors.New("发布状态无效")
	}
	if c.Kind == "moment" {
		// 日常只保留配文和有序图片，不再使用文章的标题、标记或封面等字段。
		c.Title, c.Label, c.Summary, c.CoverURL = "", "", "", ""
		c.TechStack = nil
		c.SortOrder = 0
		c.DemoURL, c.DocsURL, c.ReleaseURL = "", "", ""
	}
	if c.Kind != "moment" && c.Title == "" {
		return errors.New("请填写标题")
	}
	if c.Kind == "moment" && strings.TrimSpace(c.Body) == "" && len(c.Images) == 0 {
		return errors.New("日常至少需要文字或一张图片")
	}
	labels, valid := normalizeLineTags(c.Label, 20, 40)
	if !valid {
		return errors.New("内容标记最多 20 项，每项不超过 40 字")
	}
	c.Label = labels
	if utf8.RuneCountInString(c.Title) > 200 || len(c.Summary) > 8000 || len(c.Body) > 512*1024 {
		return errors.New("标题、摘要或正文过长（正文上限 512KB）")
	}
	if len(c.Images) > 9 || len(c.TechStack) > 20 {
		return errors.New("最多 9 张配图、20 个技术标签")
	}
	for _, image := range c.Images {
		if strings.TrimSpace(image) == "" {
			return errors.New("图片地址不能为空")
		}
	}
	for _, v := range append(append([]string{c.CoverURL}, c.Images...), "") {
		if !validURL(v, true) {
			return errors.New("图片地址无效")
		}
	}
	for _, v := range []string{c.DemoURL, c.DocsURL, c.ReleaseURL} {
		if !validURL(v, false) {
			return errors.New("外部链接必须是 http 或 https 地址")
		}
	}
	for _, v := range c.TechStack {
		if utf8.RuneCountInString(v) > 60 {
			return errors.New("技术标签过长")
		}
	}
	if c.Images == nil {
		c.Images = []string{}
	}
	if c.TechStack == nil {
		c.TechStack = []string{}
	}
	if c.Kind != "project" {
		c.Featured = false
		c.RepoOverrides = model.RepoOverrides{}
		return nil
	}
	return validateRepoOverrides(&c.RepoOverrides)
}

func validateRepoOverrides(v *model.RepoOverrides) error {
	for _, field := range []struct {
		value *string
		limit int
	}{{v.Name, 255}, {v.Description, 2000}} {
		if field.value != nil {
			*field.value = strings.TrimSpace(*field.value)
			if utf8.RuneCountInString(*field.value) > field.limit {
				return errors.New("仓库名称、描述或主要语言过长")
			}
		}
	}
	if v.Language != nil {
		languages, valid := normalizeLineTags(*v.Language, 20, 100)
		if !valid {
			return errors.New("主要语言最多 20 项，每项不超过 100 字")
		}
		*v.Language = languages
	}
	if v.URL != nil {
		*v.URL = strings.TrimSpace(*v.URL)
		if !validURL(*v.URL, false) {
			return errors.New("仓库链接必须是 http 或 https 地址")
		}
	}
	if v.UpdatedAt != nil && *v.UpdatedAt != "" {
		if _, err := time.Parse(time.RFC3339, *v.UpdatedAt); err != nil {
			return errors.New("仓库推送日期无效")
		}
	}
	return nil
}

func normalizeLineTags(value string, maxItems, maxLength int) (string, bool) {
	value = strings.ReplaceAll(strings.ReplaceAll(value, "\r\n", "\n"), "\r", "\n")
	seen := make(map[string]bool)
	items := []string{}
	for _, line := range strings.Split(value, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || seen[line] {
			continue
		}
		if utf8.RuneCountInString(line) > maxLength || len(items) >= maxItems {
			return "", false
		}
		seen[line] = true
		items = append(items, line)
	}
	return strings.Join(items, "\n"), true
}
