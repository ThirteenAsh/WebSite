package httpapi

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func (a *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := a.db.PingContext(ctx); err != nil {
			fail(w, 503, "数据库暂时不可用")
			return
		}
		jsonResponse(w, 200, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/site", a.publicSite)
	mux.HandleFunc("GET /api/contents", a.listPublic)
	mux.HandleFunc("GET /api/contents/{id}", a.getPublic)
	mux.HandleFunc("POST /api/visitor", func(w http.ResponseWriter, r *http.Request) {
		a.withVisitor(w, r)
		jsonResponse(w, 200, map[string]bool{"ok": true})
	})
	mux.HandleFunc("POST /api/contents/{id}/view", a.recordView)
	mux.HandleFunc("PUT /api/contents/{id}/like", a.setLike)
	mux.HandleFunc("POST /api/admin/login", a.login)
	mux.Handle("GET /api/admin/me", a.auth(http.HandlerFunc(a.me)))
	mux.Handle("POST /api/admin/logout", a.auth(http.HandlerFunc(a.logout)))
	mux.Handle("PUT /api/admin/password", a.auth(http.HandlerFunc(a.changePassword)))
	mux.Handle("GET /api/admin/dashboard", a.auth(http.HandlerFunc(a.dashboard)))
	mux.Handle("GET /api/admin/contents", a.auth(http.HandlerFunc(a.listAdmin)))
	mux.Handle("POST /api/admin/contents", a.auth(http.HandlerFunc(a.createContent)))
	mux.Handle("GET /api/admin/contents/{id}", a.auth(http.HandlerFunc(a.getAdmin)))
	mux.Handle("PUT /api/admin/contents/{id}", a.auth(http.HandlerFunc(a.updateContent)))
	mux.Handle("DELETE /api/admin/contents/{id}", a.auth(http.HandlerFunc(a.deleteContent)))
	mux.Handle("GET /api/admin/settings", a.auth(http.HandlerFunc(a.getSettings)))
	mux.Handle("PUT /api/admin/settings", a.auth(http.HandlerFunc(a.saveSettings)))
	mux.Handle("GET /api/admin/github/repos", a.auth(http.HandlerFunc(a.githubRepos)))
	mux.Handle("POST /api/admin/github/import", a.auth(http.HandlerFunc(a.importRepos)))
	mux.Handle("POST /api/admin/github/sync", a.auth(http.HandlerFunc(a.manualSync)))
	mux.Handle("GET /api/admin/uploads", a.auth(http.HandlerFunc(a.listUploads)))
	mux.Handle("POST /api/admin/uploads", a.auth(http.HandlerFunc(a.uploadImage)))
	mux.Handle("DELETE /api/admin/uploads/{id}", a.auth(http.HandlerFunc(a.deleteUpload)))
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { fail(w, 404, "接口不存在") })
	mux.HandleFunc("GET /uploads/{filename}", a.serveImage)
	mux.HandleFunc("GET /robots.txt", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		fmt.Fprint(w, "User-agent: *\nDisallow: /\n")
	})
	mux.HandleFunc("/", a.serveFrontend)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Robots-Tag", "noindex, nofollow, noarchive")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("X-Frame-Options", "DENY")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
		}
		defer func() {
			if e := recover(); e != nil {
				log.Printf("panic: %v", e)
				fail(w, 500, "服务暂时不可用")
			}
		}()
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
			origin := r.Header.Get("Origin")
			if origin != "" {
				u, e := url.Parse(origin)
				allowed := e == nil && u.Host == r.Host
				if a.cfg.PublicURL != "" {
					p, e := url.Parse(a.cfg.PublicURL)
					allowed = allowed || (e == nil && origin == p.Scheme+"://"+p.Host)
				}
				if !allowed {
					fail(w, 403, "不允许跨站提交")
					return
				}
			}
		}
		mux.ServeHTTP(w, r)
	})
}
