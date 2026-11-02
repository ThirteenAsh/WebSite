package httpapi

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"errors"
	"net"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func (a *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, e := r.Cookie("ash_session")
		if e != nil || !validToken(cookie.Value) {
			fail(w, 401, "请先登录")
			return
		}
		var s sessionContext
		e = a.db.QueryRowContext(r.Context(), `SELECT a.id,a.username,s.csrf_token FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(6)`, hashToken(cookie.Value)).Scan(&s.ID, &s.Username, &s.CSRF)
		if errors.Is(e, sql.ErrNoRows) {
			fail(w, 401, "登录已失效，请重新登录")
			return
		}
		if e != nil {
			serverError(w, e)
			return
		}
		if r.Method != "GET" && r.Method != "HEAD" && subtle.ConstantTimeCompare([]byte(r.Header.Get("X-CSRF-Token")), []byte(s.CSRF)) != 1 {
			fail(w, 403, "页面验证已失效，请刷新后重试")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), sessionKey, s)))
	})
}

func (a *Server) login(w http.ResponseWriter, r *http.Request) {
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	a.loginMu.Lock()
	now := time.Now()
	for k, v := range a.attempts {
		if now.Sub(v.Since) > 15*time.Minute {
			delete(a.attempts, k)
		}
	}
	attempt := a.attempts[ip]
	if attempt.Count >= 10 {
		a.loginMu.Unlock()
		w.Header().Set("Retry-After", "900")
		fail(w, 429, "登录尝试过多，请 15 分钟后重试")
		return
	}
	if attempt.Since.IsZero() {
		attempt.Since = now
	}
	attempt.Count++
	a.attempts[ip] = attempt
	a.loginMu.Unlock()
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !decode(w, r, &body) {
		return
	}
	if len(body.Username) > 80 || len(body.Password) > 72 || len(body.Password) == 0 {
		fail(w, 401, "账号或密码错误")
		return
	}
	var id int64
	var hash string
	e := a.db.QueryRowContext(r.Context(), "SELECT id,password_hash FROM admins WHERE username=?", strings.TrimSpace(body.Username)).Scan(&id, &hash)
	if e != nil && !errors.Is(e, sql.ErrNoRows) {
		serverError(w, e)
		return
	}
	if e != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Password)) != nil {
		fail(w, 401, "账号或密码错误")
		return
	}
	token, csrf := randomToken(), randomToken()
	if _, e = a.db.ExecContext(r.Context(), "INSERT INTO sessions(token_hash,admin_id,csrf_token,expires_at) VALUES(?,?,?,?)", hashToken(token), id, csrf, time.Now().UTC().Add(12*time.Hour)); e != nil {
		serverError(w, e)
		return
	}
	a.loginMu.Lock()
	delete(a.attempts, ip)
	a.loginMu.Unlock()
	a.cookie(w, "ash_session", token, 12*3600)
	jsonResponse(w, 200, map[string]any{"username": body.Username, "csrf_token": csrf})
}
func (a *Server) me(w http.ResponseWriter, r *http.Request) {
	s := r.Context().Value(sessionKey).(sessionContext)
	jsonResponse(w, 200, map[string]any{"username": s.Username, "csrf_token": s.CSRF})
}
func (a *Server) logout(w http.ResponseWriter, r *http.Request) {
	cookie, _ := r.Cookie("ash_session")
	if _, e := a.db.ExecContext(r.Context(), "DELETE FROM sessions WHERE token_hash=?", hashToken(cookie.Value)); e != nil {
		serverError(w, e)
		return
	}
	a.cookie(w, "ash_session", "", -1)
	jsonResponse(w, 200, map[string]bool{"ok": true})
}
func (a *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Current string `json:"current_password"`
		Next    string `json:"new_password"`
	}
	if !decode(w, r, &body) {
		return
	}
	if len(body.Next) < 12 || len(body.Next) > 72 {
		fail(w, 400, "新密码需要 12–72 字节")
		return
	}
	s := r.Context().Value(sessionKey).(sessionContext)
	var old string
	if e := a.db.QueryRowContext(r.Context(), "SELECT password_hash FROM admins WHERE id=?", s.ID).Scan(&old); e != nil {
		serverError(w, e)
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(old), []byte(body.Current)) != nil {
		fail(w, 400, "当前密码错误")
		return
	}
	hash, e := bcrypt.GenerateFromPassword([]byte(body.Next), 12)
	if e != nil {
		serverError(w, e)
		return
	}
	tx, e := a.db.BeginTx(r.Context(), nil)
	if e != nil {
		serverError(w, e)
		return
	}
	defer tx.Rollback()
	if _, e = tx.Exec("UPDATE admins SET password_hash=? WHERE id=?", hash, s.ID); e != nil {
		serverError(w, e)
		return
	}
	if _, e = tx.Exec("DELETE FROM sessions WHERE admin_id=?", s.ID); e != nil {
		serverError(w, e)
		return
	}
	if e = tx.Commit(); e != nil {
		serverError(w, e)
		return
	}
	a.cookie(w, "ash_session", "", -1)
	jsonResponse(w, 200, map[string]bool{"ok": true})
}
