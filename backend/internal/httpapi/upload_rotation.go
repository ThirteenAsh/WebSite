package httpapi

import (
	"bytes"
	"database/sql"
	"errors"
	"image"
	"image/draw"
	"image/jpeg"
	"image/png"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"

	"github.com/gen2brain/webp"
	xwebp "golang.org/x/image/webp"
)

func quarterTurn(src image.Image, clockwise bool) *image.NRGBA {
	b := src.Bounds()
	pixels, ok := src.(*image.NRGBA)
	if !ok {
		pixels = image.NewNRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
		draw.Draw(pixels, pixels.Bounds(), src, b.Min, draw.Src)
	}
	w, h := b.Dx(), b.Dy()
	dst := image.NewNRGBA(image.Rect(0, 0, h, w))
	// Tile the transpose for locality; copy bytes directly instead of allocating
	// a color interface for every pixel. Subimages retain their original stride.
	const tile = 32
	step := pixels.Stride
	if clockwise {
		step = -step
	}
	for y0 := 0; y0 < w; y0 += tile {
		for x0 := 0; x0 < h; x0 += tile {
			for y := y0; y < min(y0+tile, w); y++ {
				sx, sy := w-1-y, x0
				if clockwise {
					sx, sy = y, h-1-x0
				}
				si, di := sy*pixels.Stride+sx*4, y*dst.Stride+x0*4
				for x := x0; x < min(x0+tile, h); x++ {
					copy(dst.Pix[di:di+4], pixels.Pix[si:si+4])
					si += step
					di += 4
				}
			}
		}
	}
	return dst
}

// Write beside the original, then replace it atomically on the production filesystem.
func replaceImage(path string, data []byte) error {
	f, err := os.CreateTemp(filepath.Dir(path), ".rotate-*")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if err = f.Chmod(0640); err == nil {
		_, err = f.Write(data)
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(name, path)
}

func (a *Server) rotateUpload(w http.ResponseWriter, r *http.Request) {
	id, ok := contentID(w, r)
	if !ok {
		return
	}
	var input struct {
		Direction string `json:"direction"`
	}
	if !decode(w, r, &input) {
		return
	}
	if input.Direction != "left" && input.Direction != "right" {
		fail(w, 400, "请选择向左或向右旋转")
		return
	}
	ctx := r.Context()
	select {
	case imageEncodingSlot <- struct{}{}:
		defer func() { <-imageEncodingSlot }()
	case <-ctx.Done():
		return
	}
	a.uploadMu.Lock()
	defer a.uploadMu.Unlock()
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		serverError(w, err)
		return
	}
	defer tx.Rollback()
	u, err := scanUpload(tx.QueryRowContext(ctx, "SELECT "+uploadColumns+" FROM uploads u WHERE u.id=? FOR UPDATE", id))
	if errors.Is(err, sql.ErrNoRows) {
		fail(w, 404, "图片不存在")
		return
	}
	if err != nil {
		serverError(w, err)
		return
	}
	if !imageFilename.MatchString(u.Filename) {
		fail(w, 400, "图片文件名无效")
		return
	}
	path := filepath.Join(a.cfg.UploadDir, u.Filename)
	raw, err := os.ReadFile(path)
	if err != nil {
		serverError(w, err)
		return
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil || cfg.Width < 1 || cfg.Height < 1 || int64(cfg.Width)*int64(cfg.Height) > 16000000 {
		fail(w, 400, "图片无效或尺寸过大")
		return
	}
	if format == "gif" {
		fail(w, 400, "旧 GIF 图片请先转为静态图片后再旋转")
		return
	}
	var img image.Image
	if format == "webp" {
		img, err = xwebp.Decode(bytes.NewReader(raw))
	} else {
		img, _, err = image.Decode(bytes.NewReader(raw))
	}
	if err != nil {
		fail(w, 400, "图片已损坏")
		return
	}
	rotated := quarterTurn(img, input.Direction == "right")
	var data bytes.Buffer
	switch format {
	case "png":
		err = png.Encode(&data, rotated)
	case "jpeg":
		err = jpeg.Encode(&data, rotated, &jpeg.Options{Quality: 95})
	default:
		// In lossless mode Quality controls compression effort, not pixel fidelity.
		// Zero is rewritten to 75 by this wrapper, so use 1 for its fastest setting.
		err = webp.Encode(&data, rotated, webp.Options{Lossless: true, Exact: true, Method: 0, Quality: 1})
	}
	if err != nil {
		serverError(w, err)
		return
	}
	if data.Len() > maxImageBytes {
		fail(w, 400, "旋转后的图片超过 8MB，请压缩后重试")
		return
	}
	u.Revision++
	u.URL = "/uploads/" + u.Filename + "?v=" + strconv.FormatInt(u.Revision, 10)
	u.Width, u.Height, u.Size = rotated.Bounds().Dx(), rotated.Bounds().Dy(), int64(data.Len())
	if _, err = tx.ExecContext(ctx, "UPDATE uploads SET width=?,height=?,size_bytes=?,revision=? WHERE id=?", u.Width, u.Height, u.Size, u.Revision, id); err != nil {
		serverError(w, err)
		return
	}
	// Match both old unversioned URLs and previous revisions, including absolute URLs.
	pattern := "/uploads/" + regexp.QuoteMeta(u.Filename) + "([?]v=[0-9]+)?"
	if _, err = tx.ExecContext(ctx, `UPDATE contents SET body=REGEXP_REPLACE(body,?,?),cover_url=REGEXP_REPLACE(cover_url,?,?),images=REGEXP_REPLACE(CAST(images AS CHAR),?,?),updated_at=updated_at WHERE LOCATE(?,body)>0 OR LOCATE(?,cover_url)>0 OR LOCATE(?,CAST(images AS CHAR))>0`, pattern, u.URL, pattern, u.URL, pattern, u.URL, u.Filename, u.Filename, u.Filename); err != nil {
		serverError(w, err)
		return
	}
	if _, err = tx.ExecContext(ctx, `UPDATE settings SET payload=REGEXP_REPLACE(CAST(payload AS CHAR),?,?) WHERE LOCATE(?,CAST(payload AS CHAR))>0`, pattern, u.URL, u.Filename); err != nil {
		serverError(w, err)
		return
	}
	if err = replaceImage(path, data.Bytes()); err != nil {
		serverError(w, err)
		return
	}
	if err = tx.Commit(); err != nil {
		if restoreErr := replaceImage(path, raw); restoreErr != nil {
			serverError(w, errors.Join(err, restoreErr))
			return
		}
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, u)
}
