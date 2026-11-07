package httpapi

import (
	"bytes"
	"database/sql"
	"errors"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-sql-driver/mysql"

	"thirteenash/internal/model"
)

const maxImageBytes = 8 << 20

var imageFilename = regexp.MustCompile(`^[0-9a-f]{64}\.(jpg|png|gif)$`)
var uploadKeyPattern = regexp.MustCompile(`^[0-9a-f]{32}$`)

const uploadColumns = "u.id,u.filename,u.original_name,u.mime_type,u.size_bytes,u.width,u.height,u.created_at,u.content_id"

// 旧图和跨内容复用的图片也按实际引用出现在对应分类中。
const uploadReference = `(LOCATE(CONCAT('/uploads/',u.filename),c.body)>0 OR LOCATE(CONCAT('/uploads/',u.filename),c.cover_url)>0 OR LOCATE(u.filename,CAST(c.images AS CHAR))>0)`

func scanUpload(row interface{ Scan(...any) error }) (model.Upload, error) {
	var u model.Upload
	err := row.Scan(&u.ID, &u.Filename, &u.OriginalName, &u.MIME, &u.Size, &u.Width, &u.Height, &u.CreatedAt, &u.ContentID)
	u.URL = "/uploads/" + u.Filename
	return u, err
}

func uploadWriteError(w http.ResponseWriter, err error) {
	var mysqlErr *mysql.MySQLError
	if errors.As(err, &mysqlErr) && mysqlErr.Number == 1452 {
		fail(w, 404, "所选内容分类已不存在")
		return
	}
	serverError(w, err)
}

func (a *Server) respondToUploadRetry(w http.ResponseWriter, r *http.Request, key string) bool {
	u, err := scanUpload(a.db.QueryRowContext(r.Context(), "SELECT "+uploadColumns+" FROM uploads u WHERE u.upload_key=?", key))
	if errors.Is(err, sql.ErrNoRows) {
		return false
	}
	if err != nil {
		serverError(w, err)
	} else {
		jsonResponse(w, 200, u)
	}
	return true
}

func (a *Server) uploadImage(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxImageBytes+(1<<20))
	if e := r.ParseMultipartForm(maxImageBytes); e != nil {
		fail(w, 400, "图片上传失败，单张图片不能超过 8MB")
		return
	}
	defer r.MultipartForm.RemoveAll()
	var contentID *int64
	if value := r.FormValue("content_id"); value != "" {
		id, err := strconv.ParseInt(value, 10, 64)
		if err != nil || id < 1 {
			fail(w, 400, "图片分类无效")
			return
		}
		contentID = &id
	}
	key := r.FormValue("upload_key")
	var uploadKey any
	if key != "" {
		if !uploadKeyPattern.MatchString(key) {
			fail(w, 400, "上传编号无效")
			return
		}
		if a.respondToUploadRetry(w, r, key) {
			return
		}
		uploadKey = key
	}
	file, header, e := r.FormFile("file")
	if e != nil {
		fail(w, 400, "请选择图片")
		return
	}
	defer file.Close()
	raw, e := io.ReadAll(io.LimitReader(file, maxImageBytes+1))
	if e != nil || len(raw) > maxImageBytes {
		fail(w, 400, "单张图片不能超过 8MB")
		return
	}
	cfg, format, e := image.DecodeConfig(bytes.NewReader(raw))
	if e != nil || (format != "jpeg" && format != "png" && format != "gif") {
		fail(w, 400, "只支持有效的 JPG、PNG、GIF 图片，不接受 SVG 或其他文件")
		return
	}
	if cfg.Width < 1 || cfg.Height < 1 || cfg.Width > 8192 || cfg.Height > 8192 || int64(cfg.Width)*int64(cfg.Height) > 16000000 {
		fail(w, 400, "图片尺寸过大，最多 1600 万像素、单边不超过 8192")
		return
	}
	var cleaned bytes.Buffer
	ext := format
	mime := "image/" + format
	switch format {
	case "jpeg":
		img, err := jpeg.Decode(bytes.NewReader(raw))
		if err != nil {
			fail(w, 400, "图片已损坏")
			return
		}
		e = jpeg.Encode(&cleaned, img, &jpeg.Options{Quality: 88})
		ext = "jpg"
	case "png":
		img, err := png.Decode(bytes.NewReader(raw))
		if err != nil {
			fail(w, 400, "图片已损坏")
			return
		}
		e = png.Encode(&cleaned, img)
	case "gif":
		// 动态 GIF 仅保留首帧，避免大量帧解码占用小内存服务器。
		img, err := gif.Decode(bytes.NewReader(raw))
		if err != nil {
			fail(w, 400, "图片已损坏")
			return
		}
		e = gif.Encode(&cleaned, img, nil)
	}
	if e != nil {
		serverError(w, e)
		return
	}
	if cleaned.Len() > maxImageBytes {
		fail(w, 400, "处理后的图片超过 8MB，请压缩后重试")
		return
	}
	name := randomToken() + "." + ext
	path := filepath.Join(a.cfg.UploadDir, name)
	if e = os.WriteFile(path, cleaned.Bytes(), 0640); e != nil {
		serverError(w, e)
		return
	}
	original := filepath.Base(header.Filename)
	if len([]rune(original)) > 200 {
		original = string([]rune(original)[:200])
	}
	result, e := a.db.ExecContext(r.Context(), "INSERT INTO uploads(filename,original_name,mime_type,size_bytes,width,height,content_id,upload_key) VALUES(?,?,?,?,?,?,?,?)", name, original, mime, cleaned.Len(), cfg.Width, cfg.Height, contentID, uploadKey)
	if e != nil {
		_ = os.Remove(path)
		var mysqlErr *mysql.MySQLError
		if key != "" && errors.As(e, &mysqlErr) && mysqlErr.Number == 1062 && a.respondToUploadRetry(w, r, key) {
			return
		}
		uploadWriteError(w, e)
		return
	}
	id, _ := result.LastInsertId()
	jsonResponse(w, 201, model.Upload{ID: id, Filename: name, OriginalName: original, MIME: mime, Size: int64(cleaned.Len()), Width: cfg.Width, Height: cfg.Height, CreatedAt: time.Now().UTC(), URL: "/uploads/" + name, ContentID: contentID})
}
func (a *Server) listUploads(w http.ResponseWriter, r *http.Request) {
	page := intQuery(r, "page", 1, 1, 100000)
	limit := 24
	where := "1=1"
	args := []any{}
	switch group := r.URL.Query().Get("content_id"); group {
	case "":
	case "0":
		where = "u.content_id IS NULL AND NOT EXISTS (SELECT 1 FROM contents c WHERE " + uploadReference + ")"
	default:
		id, err := strconv.ParseInt(group, 10, 64)
		if err != nil || id < 1 {
			fail(w, 400, "图片分类无效")
			return
		}
		where = "(u.content_id=? OR EXISTS (SELECT 1 FROM contents c WHERE c.id=? AND " + uploadReference + "))"
		args = append(args, id, id)
	}
	if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
		if utf8.RuneCountInString(q) > 100 {
			fail(w, 400, "搜索词最多 100 字")
			return
		}
		where += " AND u.original_name LIKE ? ESCAPE '='"
		args = append(args, "%"+strings.NewReplacer("=", "==", "%", "=%", "_", "=_").Replace(q)+"%")
	}
	var total int
	if e := a.db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM uploads u WHERE "+where, args...).Scan(&total); e != nil {
		serverError(w, e)
		return
	}
	rows, e := a.db.QueryContext(r.Context(), "SELECT "+uploadColumns+" FROM uploads u WHERE "+where+" ORDER BY u.id DESC LIMIT ? OFFSET ?", append(args, limit, (page-1)*limit)...)
	if e != nil {
		serverError(w, e)
		return
	}
	defer rows.Close()
	items := []model.Upload{}
	for rows.Next() {
		u, e := scanUpload(rows)
		if e != nil {
			serverError(w, e)
			return
		}
		items = append(items, u)
	}
	if e = rows.Err(); e != nil {
		serverError(w, e)
		return
	}
	jsonResponse(w, 200, map[string]any{"items": items, "total": total, "page": page, "pages": (total + limit - 1) / limit})
}
func (a *Server) listUploadGroups(w http.ResponseWriter, r *http.Request) {
	type group struct {
		ID        int64     `json:"id"`
		Kind      string    `json:"kind"`
		Title     string    `json:"title"`
		CreatedAt time.Time `json:"created_at"`
	}
	rows, err := a.db.QueryContext(r.Context(), "SELECT id,kind,title,created_at FROM contents ORDER BY updated_at DESC,id DESC")
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()
	groups := []group{}
	for rows.Next() {
		var g group
		if err := rows.Scan(&g.ID, &g.Kind, &g.Title, &g.CreatedAt); err != nil {
			serverError(w, err)
			return
		}
		groups = append(groups, g)
	}
	if err := rows.Err(); err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, groups)
}
func (a *Server) moveUpload(w http.ResponseWriter, r *http.Request) {
	id, ok := contentID(w, r)
	if !ok {
		return
	}
	var input struct {
		ContentID *int64 `json:"content_id"`
	}
	if !decode(w, r, &input) {
		return
	}
	if input.ContentID != nil && *input.ContentID < 1 {
		fail(w, 400, "图片分类无效")
		return
	}
	result, err := a.db.ExecContext(r.Context(), "UPDATE uploads SET content_id=? WHERE id=?", input.ContentID, id)
	if err != nil {
		uploadWriteError(w, err)
		return
	}
	if count, _ := result.RowsAffected(); count == 0 {
		var exists bool
		if err = a.db.QueryRowContext(r.Context(), "SELECT EXISTS (SELECT 1 FROM uploads WHERE id=?)", id).Scan(&exists); err != nil {
			serverError(w, err)
			return
		}
		if !exists {
			fail(w, 404, "图片不存在")
			return
		}
	}
	jsonResponse(w, 200, map[string]bool{"ok": true})
}
func (a *Server) deleteUpload(w http.ResponseWriter, r *http.Request) {
	id, ok := contentID(w, r)
	if !ok {
		return
	}
	var name string
	var used bool
	e := a.db.QueryRowContext(r.Context(), "SELECT u.filename, EXISTS (SELECT 1 FROM contents c WHERE "+uploadReference+") FROM uploads u WHERE u.id=?", id).Scan(&name, &used)
	if errors.Is(e, sql.ErrNoRows) {
		fail(w, 404, "图片不存在")
		return
	}
	if e != nil {
		serverError(w, e)
		return
	}
	var settings []byte
	if e = a.db.QueryRowContext(r.Context(), "SELECT payload FROM settings WHERE id=1").Scan(&settings); e != nil {
		serverError(w, e)
		return
	}
	if used || strings.Contains(string(settings), name) {
		fail(w, 409, "图片仍被内容或个人信息引用，请先移除引用并保存")
		return
	}
	if !imageFilename.MatchString(name) {
		fail(w, 400, "图片文件名无效")
		return
	}
	if e = os.Remove(filepath.Join(a.cfg.UploadDir, name)); e != nil && !os.IsNotExist(e) {
		serverError(w, e)
		return
	}
	if _, e = a.db.ExecContext(r.Context(), "DELETE FROM uploads WHERE id=?", id); e != nil {
		serverError(w, e)
		return
	}
	jsonResponse(w, 200, map[string]bool{"ok": true})
}
func (a *Server) serveImage(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("filename")
	if !imageFilename.MatchString(name) {
		http.NotFound(w, r)
		return
	}
	var mime string
	e := a.db.QueryRowContext(r.Context(), "SELECT mime_type FROM uploads WHERE filename=?", name).Scan(&mime)
	if errors.Is(e, sql.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if e != nil {
		serverError(w, e)
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeFile(w, r, filepath.Join(a.cfg.UploadDir, name))
}
