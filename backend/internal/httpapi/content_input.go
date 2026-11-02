package httpapi

import (
	"errors"
	"net/url"
	"strings"
	"unicode/utf8"

	"thirteenash/internal/model"
)

// 写入请求只接收可编辑字段，系统时间、统计和 GitHub 元数据由服务端维护。
type contentInput struct {
	Kind       string   `json:"kind"`
	Label      string   `json:"label"`
	Title      string   `json:"title"`
	Summary    string   `json:"summary"`
	Body       string   `json:"body"`
	CoverURL   string   `json:"cover_url"`
	Images     []string `json:"images"`
	TechStack  []string `json:"tech_stack"`
	Status     string   `json:"status"`
	Featured   bool     `json:"featured"`
	SortOrder  int      `json:"sort_order"`
	DemoURL    string   `json:"demo_url"`
	DocsURL    string   `json:"docs_url"`
	ReleaseURL string   `json:"release_url"`
}

func (v contentInput) content() model.Content {
	return model.Content{Kind: v.Kind, Label: v.Label, Title: v.Title, Summary: v.Summary, Body: v.Body, CoverURL: v.CoverURL, Images: v.Images, TechStack: v.TechStack, Status: v.Status, Featured: v.Featured, SortOrder: v.SortOrder, DemoURL: v.DemoURL, DocsURL: v.DocsURL, ReleaseURL: v.ReleaseURL}
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
	if c.Kind != "moment" && c.Title == "" {
		return errors.New("请填写标题")
	}
	if c.Kind == "moment" && strings.TrimSpace(c.Body) == "" && len(c.Images) == 0 {
		return errors.New("短动态至少需要文字或一张图片")
	}
	if utf8.RuneCountInString(c.Title) > 200 || utf8.RuneCountInString(c.Label) > 40 || len(c.Summary) > 8000 || len(c.Body) > 512*1024 {
		return errors.New("标题、摘要或正文过长（正文上限 512KB）")
	}
	if len(c.Images) > 9 || len(c.TechStack) > 20 {
		return errors.New("最多 9 张配图、20 个技术标签")
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
	}
	return nil
}
