package httpapi

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
)

func jsonResponse(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func fail(w http.ResponseWriter, status int, message string) {
	jsonResponse(w, status, map[string]string{"error": message})
}
func serverError(w http.ResponseWriter, err error) {
	log.Printf("请求失败: %v", err)
	fail(w, 500, "操作失败，请稍后重试")
}
func decode(w http.ResponseWriter, r *http.Request, value any) bool {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		fail(w, 415, "请求必须为 JSON")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
	d := json.NewDecoder(r.Body)
	if err := d.Decode(value); err != nil {
		fail(w, 400, "请求内容无效或过大")
		return false
	}
	var extra any
	if err := d.Decode(&extra); !errors.Is(err, io.EOF) {
		fail(w, 400, "请求只能包含一个 JSON 对象")
		return false
	}
	return true
}
func randomToken() string {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b)
}
func hashToken(token string) string {
	s := sha256.Sum256([]byte(token))
	return hex.EncodeToString(s[:])
}
func validToken(token string) bool {
	if len(token) != 64 {
		return false
	}
	_, e := hex.DecodeString(token)
	return e == nil
}
func (a *Server) cookie(w http.ResponseWriter, name, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: "/", HttpOnly: true, Secure: a.cfg.Secure, SameSite: http.SameSiteLaxMode, MaxAge: maxAge})
}
func visitorHash(r *http.Request) string {
	c, e := r.Cookie("ash_visitor")
	if e != nil {
		return ""
	}
	if !validToken(c.Value) {
		return ""
	}
	return hashToken(c.Value)
}
func (a *Server) withVisitor(w http.ResponseWriter, r *http.Request) string {
	if hash := visitorHash(r); hash != "" {
		return hash
	}
	token := randomToken()
	a.cookie(w, "ash_visitor", token, 365*86400)
	return hashToken(token)
}

func contentID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, e := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if e != nil || id < 1 {
		fail(w, 404, "内容不存在")
		return 0, false
	}
	return id, true
}
func intQuery(r *http.Request, key string, fallback, min, max int) int {
	n, e := strconv.Atoi(r.URL.Query().Get(key))
	if e != nil {
		return fallback
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}
