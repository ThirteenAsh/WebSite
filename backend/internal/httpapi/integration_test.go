package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"thirteenash/internal/bootstrap"
	"thirteenash/internal/config"
	"thirteenash/internal/database"
	"thirteenash/internal/github"
	"thirteenash/internal/model"
	"thirteenash/internal/repository"
)

// 显式设置 TEST_MYSQL=1 才运行真实数据库测试。只创建和清理随机命名的测试库。
func TestIntegration(t *testing.T) {
	if os.Getenv("TEST_MYSQL") != "1" {
		t.Skip("设置 TEST_MYSQL=1，使用 .env 连接独立的临时测试库")
	}
	dbName := "thirteenash_test_" + randomToken()[:12]
	t.Setenv("DB_NAME", dbName)
	cfg, e := config.Load(filepath.Join("..", "..", ".env"))
	if e != nil {
		t.Fatal(e)
	}
	db, e := database.Open(cfg.Database, true)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() {
		_, err := db.Exec("DROP DATABASE `" + dbName + "`")
		if err != nil {
			t.Errorf("清理临时测试库: %v", err)
		}
		db.Close()
	})
	if e = database.Migrate(db); e != nil {
		t.Fatal(e)
	}
	if e = database.Migrate(db); e != nil {
		t.Fatalf("SQL 重复执行: %v", e)
	}
	if e = bootstrap.SeedDefaults(db); e != nil {
		t.Fatal(e)
	}
	if e = bootstrap.SeedDefaults(db); e != nil {
		t.Fatal(e)
	}
	var seedCount int
	if e = db.QueryRow("SELECT COUNT(*) FROM contents").Scan(&seedCount); e != nil || seedCount != 4 {
		t.Fatalf("迁入应为4个项目，实际 %d: %v", seedCount, e)
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte("test-password-2026"), bcrypt.MinCost)
	if _, e = db.Exec("INSERT INTO admins(username,password_hash) VALUES('tester',?)", hash); e != nil {
		t.Fatal(e)
	}
	loc, _ := time.LoadLocation("Asia/Shanghai")
	app := New(db, config.Server{UploadDir: t.TempDir(), FrontendDir: t.TempDir(), Location: loc, SyncHour: 4}, github.NewClient(""))
	githubServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		repo := github.Repository{ID: 999001, Name: "fixture-repo", FullName: "fixture/fixture-repo", Description: "来自同步的仓库描述", Language: "Go", HTMLURL: "https://github.com/fixture/fixture-repo"}
		now := time.Now().UTC()
		repo.PushedAt = &now
		if strings.HasPrefix(r.URL.Path, "/users/") {
			_ = json.NewEncoder(w).Encode([]github.Repository{repo})
			return
		}
		if r.URL.Path == "/repos/fixture/fixture-repo" {
			_ = json.NewEncoder(w).Encode(repo)
			return
		}
		http.NotFound(w, r)
	}))
	defer githubServer.Close()
	app.github.BaseURL = githubServer.URL
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	jar, _ := cookiejar.New(nil)
	admin := &http.Client{Jar: jar}
	visitorJar, _ := cookiejar.New(nil)
	visitor := &http.Client{Jar: visitorJar}
	csrf := ""
	request := func(client *http.Client, method, path string, body any, want int, token string) []byte {
		t.Helper()
		var reader io.Reader
		if body != nil {
			raw, _ := json.Marshal(body)
			reader = bytes.NewReader(raw)
		}
		req, err := http.NewRequest(method, server.URL+path, reader)
		if err != nil {
			t.Fatal(err)
		}
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		if token != "" {
			req.Header.Set("X-CSRF-Token", token)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		raw, err := io.ReadAll(resp.Body)
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != want {
			t.Fatalf("%s %s: HTTP %d want %d: %s", method, path, resp.StatusCode, want, raw)
		}
		if resp.Header.Get("X-Robots-Tag") != "noindex, nofollow, noarchive" {
			t.Error("缺少禁止收录响应头")
		}
		return raw
	}
	var contentID int64
	t.Run("认证及跨站请求", func(t *testing.T) {
		request(admin, "GET", "/api/admin/contents", nil, 401, "")
		request(admin, "POST", "/api/admin/login", map[string]string{"username": "tester", "password": "wrong"}, 401, "")
		raw := request(admin, "POST", "/api/admin/login", map[string]string{"username": "tester", "password": "test-password-2026"}, 200, "")
		var result map[string]string
		_ = json.Unmarshal(raw, &result)
		csrf = result["csrf_token"]
		if csrf == "" {
			t.Fatal("缺少CSRF token")
		}
		request(admin, "POST", "/api/admin/contents", map[string]any{}, 403, "")
		req, _ := http.NewRequest("POST", server.URL+"/api/visitor", nil)
		req.Header.Set("Origin", "https://evil.example")
		resp, e := visitor.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		resp.Body.Close()
		if resp.StatusCode != 403 {
			t.Error("跨站请求未被拒绝")
		}
		request(visitor, "POST", "/api/visitor", nil, 200, "")
	})
	t.Run("草稿发布搜索和撤回", func(t *testing.T) {
		c := model.Content{Kind: "article", Title: "集成验收技术笔记", Summary: "中文摘要", Body: "## 本文关键词\n\n中文检索和100%覆盖\n\n```go\nfmt.Println(42)\n```", Status: "draft", Images: []string{}, TechStack: []string{}}
		// Vue 新建内容时系统日期为空；写入 DTO 必须忽略这些只读字段。
		encoded, _ := json.Marshal(c)
		var createBody map[string]any
		_ = json.Unmarshal(encoded, &createBody)
		createBody["created_at"] = ""
		createBody["updated_at"] = ""
		raw := request(admin, "POST", "/api/admin/contents", createBody, 201, csrf)
		var saved map[string]int64
		_ = json.Unmarshal(raw, &saved)
		contentID = saved["id"]
		path := fmt.Sprintf("/api/contents/%d", contentID)
		request(visitor, "GET", path, nil, 404, "")
		request(visitor, "POST", path+"/view", nil, 404, "")
		request(visitor, "PUT", path+"/like", map[string]bool{"liked": true}, 404, "")
		raw = request(visitor, "GET", "/api/contents?q=集成验收", nil, 200, "")
		if !strings.Contains(string(raw), `"total":0`) {
			t.Fatal("草稿泄漏到搜索结果")
		}
		c.Status = "published"
		request(admin, "PUT", fmt.Sprintf("/api/admin/contents/%d", contentID), c, 200, csrf)
		raw = request(visitor, "GET", path, nil, 200, "")
		if !strings.Contains(string(raw), "中文检索") {
			t.Fatal("正文丢失")
		}
		for _, q := range []string{"中文检索", "100%25"} {
			raw = request(visitor, "GET", "/api/contents?q="+q, nil, 200, "")
			if !strings.Contains(string(raw), `"total":1`) {
				t.Fatalf("中文/字面百分号搜索失败: %s", raw)
			}
		}
		c.Status = "draft"
		request(admin, "PUT", fmt.Sprintf("/api/admin/contents/%d", contentID), c, 200, csrf)
		request(visitor, "GET", path, nil, 404, "")
		c.Status = "published"
		request(admin, "PUT", fmt.Sprintf("/api/admin/contents/%d", contentID), c, 200, csrf)
		request(admin, "GET", "/api/admin/contents?status=published&kind=article", nil, 200, csrf)
	})
	t.Run("点赞幂等取消和并发", func(t *testing.T) {
		path := fmt.Sprintf("/api/contents/%d/like", contentID)
		request(visitor, "PUT", path, map[string]bool{"liked": true}, 200, "")
		request(visitor, "PUT", path, map[string]bool{"liked": true}, 200, "")
		var count int
		if e := db.QueryRow("SELECT like_count FROM contents WHERE id=?", contentID).Scan(&count); e != nil || count != 1 {
			t.Fatalf("重复点赞实际%d %v", count, e)
		}
		request(visitor, "PUT", path, map[string]bool{"liked": false}, 200, "")
		request(visitor, "PUT", path, map[string]bool{"liked": false}, 200, "")
		var wg sync.WaitGroup
		errs := make(chan error, 12)
		for i := 0; i < 12; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				req, _ := http.NewRequest("PUT", server.URL+path, strings.NewReader(`{"liked":true}`))
				req.Header.Set("Content-Type", "application/json")
				resp, e := visitor.Do(req)
				if e != nil {
					errs <- e
					return
				}
				io.Copy(io.Discard, resp.Body)
				resp.Body.Close()
				if resp.StatusCode != 200 {
					errs <- fmt.Errorf("HTTP %d", resp.StatusCode)
				}
			}()
		}
		wg.Wait()
		close(errs)
		for err := range errs {
			t.Error(err)
		}
		if e := db.QueryRow("SELECT like_count FROM contents WHERE id=?", contentID).Scan(&count); e != nil || count != 1 {
			t.Fatalf("并发点赞计数%d %v", count, e)
		}
	})
	t.Run("浏览30分钟去重及新访客", func(t *testing.T) {
		path := fmt.Sprintf("/api/contents/%d/view", contentID)
		request(visitor, "POST", path, nil, 200, "")
		request(visitor, "POST", path, nil, 200, "")
		var count int
		_ = db.QueryRow("SELECT view_count FROM contents WHERE id=?", contentID).Scan(&count)
		if count != 1 {
			t.Fatal("重复访问未去重")
		}
		if _, e := db.Exec("UPDATE content_views SET last_view_at=UTC_TIMESTAMP(6)-INTERVAL 31 MINUTE WHERE content_id=?", contentID); e != nil {
			t.Fatal(e)
		}
		request(visitor, "POST", path, nil, 200, "")
		otherJar, _ := cookiejar.New(nil)
		other := &http.Client{Jar: otherJar}
		request(other, "POST", path, nil, 200, "")
		_ = db.QueryRow("SELECT view_count FROM contents WHERE id=?", contentID).Scan(&count)
		if count != 3 {
			t.Fatalf("去重窗口或新访客计数%d", count)
		}
	})
	var uploaded model.Upload
	t.Run("真实图片校验引用保护和删除", func(t *testing.T) {
		uploadFile := func(name string, data []byte, want int) []byte {
			t.Helper()
			var body bytes.Buffer
			writer := multipart.NewWriter(&body)
			part, _ := writer.CreateFormFile("file", name)
			_, _ = part.Write(data)
			_ = writer.Close()
			req, _ := http.NewRequest("POST", server.URL+"/api/admin/uploads", &body)
			req.Header.Set("Content-Type", writer.FormDataContentType())
			req.Header.Set("X-CSRF-Token", csrf)
			resp, e := admin.Do(req)
			if e != nil {
				t.Fatal(e)
			}
			defer resp.Body.Close()
			raw, _ := io.ReadAll(resp.Body)
			if resp.StatusCode != want {
				t.Fatalf("上传HTTP%d want%d: %s", resp.StatusCode, want, raw)
			}
			return raw
		}
		uploadFile("fake.jpg", []byte("<script>alert(1)</script>"), 400)
		uploadFile("vector.svg", []byte(`<svg xmlns="http://www.w3.org/2000/svg"/>`), 400)
		img := image.NewRGBA(image.Rect(0, 0, 4, 4))
		img.Set(1, 1, color.RGBA{255, 80, 40, 255})
		var pngData bytes.Buffer
		_ = png.Encode(&pngData, img)
		raw := uploadFile("验收配图.png", append(pngData.Bytes(), []byte("UNWANTED-METADATA")...), 201)
		if e := json.Unmarshal(raw, &uploaded); e != nil {
			t.Fatal(e)
		}
		saved, e := os.ReadFile(filepath.Join(app.cfg.UploadDir, uploaded.Filename))
		if e != nil || bytes.Contains(saved, []byte("UNWANTED-METADATA")) {
			t.Fatal("图片未被重新编码")
		}
		request(visitor, "GET", uploaded.URL, nil, 200, "")
		c := model.Content{Kind: "moment", Body: "短动态中文记录", Images: []string{uploaded.URL}, TechStack: []string{}, Status: "published"}
		raw = request(admin, "POST", "/api/admin/contents", c, 201, csrf)
		var created map[string]int64
		_ = json.Unmarshal(raw, &created)
		request(admin, "DELETE", fmt.Sprintf("/api/admin/uploads/%d", uploaded.ID), nil, 409, csrf)
		request(admin, "DELETE", fmt.Sprintf("/api/admin/contents/%d", created["id"]), nil, 200, csrf)
		request(admin, "DELETE", fmt.Sprintf("/api/admin/uploads/%d", uploaded.ID), nil, 200, csrf)
		request(visitor, "GET", uploaded.URL, nil, 404, "")
	})
	t.Run("GitHub选择导入同步保留自定义字段", func(t *testing.T) {
		request(admin, "GET", "/api/admin/github/repos", nil, 200, csrf)
		body := map[string]any{"ids": []int64{999001}}
		request(admin, "POST", "/api/admin/github/import", body, 200, csrf)
		raw := request(admin, "POST", "/api/admin/github/import", body, 200, csrf)
		if !strings.Contains(string(raw), `"imported":0`) {
			t.Fatal("重复导入产生了新项目")
		}
		var id int64
		var status string
		_ = db.QueryRow("SELECT id,status FROM contents WHERE repo_id=999001").Scan(&id, &status)
		if status != "draft" {
			t.Fatal("导入自动发布")
		}
		if _, e := db.Exec("UPDATE contents SET title='手写项目名',summary='手写摘要',body='手写正文',sort_order=7,featured=1 WHERE id=?", id); e != nil {
			t.Fatal(e)
		}
		raw = request(admin, "POST", "/api/admin/github/sync", nil, 200, csrf)
		var result syncResult
		_ = json.Unmarshal(raw, &result)
		if result.Updated != 1 || len(result.Errors) != 4 {
			t.Fatalf("同步结果异常: %s", raw)
		}
		c, e := repository.ScanContent(db.QueryRow("SELECT "+repository.ContentColumns+" FROM contents WHERE id=?", id))
		if e != nil {
			t.Fatal(e)
		}
		if c.Title != "手写项目名" || c.Summary != "手写摘要" || c.Body != "手写正文" || c.Status != "draft" || !c.Featured || c.SortOrder != 7 || c.RepoDescription != "来自同步的仓库描述" {
			t.Fatalf("同步覆盖了展示字段: %+v", c)
		}
		request(visitor, "GET", fmt.Sprintf("/api/contents/%d", id), nil, 404, "")
	})
	t.Run("每日任务去重及停机补执行", func(t *testing.T) {
		app.cfg.SyncHour = 0
		ran, err := app.runScheduled(context.Background(), time.Now())
		if err != nil || ran {
			t.Fatalf("同日不应重复执行: %v %v", ran, err)
		}
		previous := syncResult{At: time.Now().Add(-24 * time.Hour)}
		raw, _ := json.Marshal(previous)
		if _, err = db.Exec("UPDATE app_state SET state_value=? WHERE state_key='github_sync'", raw); err != nil {
			t.Fatal(err)
		}
		ran, err = app.runScheduled(context.Background(), time.Now())
		if err != nil || !ran {
			t.Fatalf("未补执行到期任务: %v %v", ran, err)
		}
		var saved string
		if err = db.QueryRow("SELECT state_value FROM app_state WHERE state_key='github_sync'").Scan(&saved); err != nil {
			t.Fatal(err)
		}
		var result syncResult
		_ = json.Unmarshal([]byte(saved), &result)
		if result.Trigger != "daily" || result.Updated != 1 {
			t.Fatalf("每日任务结果不正确: %s", saved)
		}
		ran, err = app.runScheduled(context.Background(), time.Now())
		if err != nil || ran {
			t.Fatalf("当天任务发生重复: %v %v", ran, err)
		}
	})
	t.Run("设置保存及密码会话撤销", func(t *testing.T) {
		s, e := app.settings(context.Background())
		if e != nil {
			t.Fatal(e)
		}
		s.Intro = "已保存的个人简介"
		request(admin, "PUT", "/api/admin/settings", s, 200, csrf)
		raw := request(visitor, "GET", "/api/site", nil, 200, "")
		if !strings.Contains(string(raw), s.Intro) {
			t.Fatal("设置未公开更新")
		}
		request(admin, "PUT", "/api/admin/password", map[string]string{"current_password": "test-password-2026", "new_password": "new-password-2026"}, 200, csrf)
		request(admin, "GET", "/api/admin/me", nil, 401, "")
		request(admin, "POST", "/api/admin/login", map[string]string{"username": "tester", "password": "new-password-2026"}, 200, "")
	})
	t.Run("删除内容清理互动记录", func(t *testing.T) {
		var me map[string]string
		_ = json.Unmarshal(request(admin, "GET", "/api/admin/me", nil, 200, ""), &me)
		csrf = me["csrf_token"]
		request(admin, "DELETE", fmt.Sprintf("/api/admin/contents/%d", contentID), nil, 200, csrf)
		request(visitor, "GET", fmt.Sprintf("/api/contents/%d", contentID), nil, 404, "")
		for _, table := range []string{"content_likes", "content_views"} {
			var count int
			if e := db.QueryRow("SELECT COUNT(*) FROM "+table+" WHERE content_id=?", contentID).Scan(&count); e != nil || count != 0 {
				t.Fatalf("%s 级联清理失败: %d %v", table, count, e)
			}
		}
	})
	t.Run("禁止收录及静态路由", func(t *testing.T) {
		raw := request(visitor, "GET", "/robots.txt", nil, 200, "")
		if !strings.Contains(string(raw), "Disallow: /") {
			t.Fatal("robots规则错误")
		}
		if e := os.WriteFile(filepath.Join(app.cfg.FrontendDir, "index.html"), []byte("<html>SPA</html>"), 0600); e != nil {
			t.Fatal(e)
		}
		request(visitor, "GET", "/", nil, 200, "")
		request(visitor, "GET", "/articles/42", nil, 200, "")
		request(visitor, "GET", "/missing.js", nil, 404, "")
		request(visitor, "POST", "/articles/42", nil, 405, "")
	})
}

func TestValidateContent(t *testing.T) {
	for _, c := range []model.Content{{Kind: "article", Status: "published"}, {Kind: "moment", Status: "draft"}, {Kind: "article", Title: "标题", Status: "draft", DemoURL: "javascript:alert(1)"}, {Kind: "article", Title: "标题", Status: "draft", CoverURL: "//evil.example/x"}} {
		if validateContent(&c) == nil {
			t.Fatalf("非法内容通过校验: %+v", c)
		}
	}
	c := model.Content{Kind: "moment", Status: "draft", Body: "日常记录"}
	if e := validateContent(&c); e != nil {
		t.Fatal(e)
	}
}

func TestSyncDue(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Shanghai")
	morning := time.Date(2026, 11, 2, 3, 59, 0, 0, loc)
	if syncDue(morning, syncResult{}, 4, loc) {
		t.Fatal("计划时间前不应运行")
	}
	due := morning.Add(time.Minute)
	if !syncDue(due, syncResult{}, 4, loc) {
		t.Fatal("计划时刻应运行")
	}
	if syncDue(due, syncResult{At: due.Add(-time.Hour)}, 4, loc) {
		t.Fatal("同日已手动同步不应重跑")
	}
	if !syncDue(due.Add(8*time.Hour), syncResult{At: due.Add(-24 * time.Hour)}, 4, loc) {
		t.Fatal("当天晚些时候启动应补执行")
	}
}
