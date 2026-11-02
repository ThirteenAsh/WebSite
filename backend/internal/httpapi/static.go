package httpapi

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func (a *Server) serveFrontend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/uploads/") {
		http.NotFound(w, r)
		return
	}
	name := filepath.Clean(filepath.FromSlash(strings.TrimPrefix(r.URL.Path, "/")))
	if strings.HasPrefix(name, "..") || strings.Contains(name, ":") {
		http.NotFound(w, r)
		return
	}
	path := filepath.Join(a.cfg.FrontendDir, name)
	if name != "." {
		if stat, e := os.Stat(path); e == nil && !stat.IsDir() {
			http.ServeFile(w, r, path)
			return
		}
	}
	if name != "." && filepath.Ext(name) != "" {
		http.NotFound(w, r)
		return
	}
	index := filepath.Join(a.cfg.FrontendDir, "index.html")
	if _, e := os.Stat(index); e != nil {
		http.Error(w, "前端尚未构建，请在 frontend 执行 npm run build，或通过 Vite 开发地址访问。", 503)
		return
	}
	w.Header().Set("Cache-Control", "no-cache")
	http.ServeFile(w, r, index)
}
