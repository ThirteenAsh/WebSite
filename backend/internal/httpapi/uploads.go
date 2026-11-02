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
	"strings"

	"thirteenash/internal/model"
)

const maxImageBytes = 8 << 20

var imageFilename = regexp.MustCompile(`^[0-9a-f]{64}\.(jpg|png|gif)$`)

func (a *Server) uploadImage(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxImageBytes+(1<<20))
	if e := r.ParseMultipartForm(maxImageBytes); e != nil {
		fail(w, 400, "图片上传失败，单张图片不能超过 8MB")
		return
	}
	defer r.MultipartForm.RemoveAll()
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
	result, e := a.db.ExecContext(r.Context(), "INSERT INTO uploads(filename,original_name,mime_type,size_bytes,width,height) VALUES(?,?,?,?,?,?)", name, original, mime, cleaned.Len(), cfg.Width, cfg.Height)
	if e != nil {
		_ = os.Remove(path)
		serverError(w, e)
		return
	}
	id, _ := result.LastInsertId()
	jsonResponse(w, 201, model.Upload{ID: id, Filename: name, OriginalName: original, MIME: mime, Size: int64(cleaned.Len()), Width: cfg.Width, Height: cfg.Height, URL: "/uploads/" + name})
}
func (a *Server) listUploads(w http.ResponseWriter, r *http.Request) {
	page := intQuery(r, "page", 1, 1, 100000)
	limit := 24
	var total int
	if e := a.db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM uploads").Scan(&total); e != nil {
		serverError(w, e)
		return
	}
	rows, e := a.db.QueryContext(r.Context(), "SELECT id,filename,original_name,mime_type,size_bytes,width,height,created_at FROM uploads ORDER BY id DESC LIMIT ? OFFSET ?", limit, (page-1)*limit)
	if e != nil {
		serverError(w, e)
		return
	}
	defer rows.Close()
	items := []model.Upload{}
	for rows.Next() {
		var u model.Upload
		if e = rows.Scan(&u.ID, &u.Filename, &u.OriginalName, &u.MIME, &u.Size, &u.Width, &u.Height, &u.CreatedAt); e != nil {
			serverError(w, e)
			return
		}
		u.URL = "/uploads/" + u.Filename
		items = append(items, u)
	}
	if e = rows.Err(); e != nil {
		serverError(w, e)
		return
	}
	jsonResponse(w, 200, map[string]any{"items": items, "total": total, "page": page, "pages": (total + limit - 1) / limit})
}
func (a *Server) deleteUpload(w http.ResponseWriter, r *http.Request) {
	id, ok := contentID(w, r)
	if !ok {
		return
	}
	var name string
	e := a.db.QueryRowContext(r.Context(), "SELECT filename FROM uploads WHERE id=?", id).Scan(&name)
	if errors.Is(e, sql.ErrNoRows) {
		fail(w, 404, "图片不存在")
		return
	}
	if e != nil {
		serverError(w, e)
		return
	}
	url := "/uploads/" + name
	var n int
	if e = a.db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM contents WHERE LOCATE(?,body)>0 OR cover_url=? OR LOCATE(?,CAST(images AS CHAR))>0", url, url, name).Scan(&n); e != nil {
		serverError(w, e)
		return
	}
	var settings []byte
	if e = a.db.QueryRowContext(r.Context(), "SELECT payload FROM settings WHERE id=1").Scan(&settings); e != nil {
		serverError(w, e)
		return
	}
	if n > 0 || strings.Contains(string(settings), name) {
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
