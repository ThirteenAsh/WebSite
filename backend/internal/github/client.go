package github

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	HTTPClient *http.Client
	BaseURL    string
	token      string
}

func NewClient(token string) *Client {
	return &Client{HTTPClient: &http.Client{Timeout: 15 * time.Second}, BaseURL: "https://api.github.com", token: token}
}

type Repository struct {
	ID          int64      `json:"id"`
	Name        string     `json:"name"`
	FullName    string     `json:"full_name"`
	Description string     `json:"description"`
	Language    string     `json:"language"`
	HTMLURL     string     `json:"html_url"`
	PushedAt    *time.Time `json:"pushed_at"`
	Private     bool       `json:"private"`
	Archived    bool       `json:"archived"`
	Selected    bool       `json:"selected"`
	ContentID   int64      `json:"content_id"`
}

func (c *Client) get(ctx context.Context, path string, out any) error {
	req, e := http.NewRequestWithContext(ctx, "GET", c.BaseURL+path, nil)
	if e != nil {
		return e
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "ThirteenAsh-Personal-Space")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	resp, e := c.HTTPClient.Do(req)
	if e != nil {
		return errors.New("连接 GitHub 失败，请检查网络后重试")
	}
	defer resp.Body.Close()
	if resp.StatusCode == 403 || resp.StatusCode == 429 {
		return errors.New("GitHub 请求受限，请稍后重试，或在后端配置 GITHUB_TOKEN")
	}
	if resp.StatusCode == 404 {
		return errors.New("GitHub 用户或公开仓库不存在")
	}
	if resp.StatusCode != 200 {
		return fmt.Errorf("GitHub 返回 HTTP %d", resp.StatusCode)
	}
	if e = json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(out); e != nil {
		return errors.New("GitHub 返回的数据格式无效")
	}
	return nil
}
func (c *Client) ListRepos(ctx context.Context, username string) ([]Repository, error) {
	var e error
	all := []Repository{}
	for page := 1; page <= 50; page++ {
		var repos []Repository
		e = c.get(ctx, fmt.Sprintf("/users/%s/repos?type=owner&sort=updated&per_page=100&page=%d", url.PathEscape(username), page), &repos)
		if e != nil {
			return nil, e
		}
		for _, repo := range repos {
			if !repo.Private {
				all = append(all, repo)
			}
		}
		if len(repos) < 100 {
			return all, nil
		}
	}
	return nil, errors.New("公开仓库超过 5000 个，请缩小导入范围")
}

func (c *Client) GetRepo(ctx context.Context, fullName string) (Repository, error) {
	var repo Repository
	parts := strings.Split(fullName, "/")
	if len(parts) != 2 {
		return repo, errors.New("仓库标识无效")
	}
	err := c.get(ctx, "/repos/"+url.PathEscape(parts[0])+"/"+url.PathEscape(parts[1]), &repo)
	return repo, err
}
