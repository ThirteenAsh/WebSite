package httpapi

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	"os"
	"testing"

	"github.com/gen2brain/webp"
	xwebp "golang.org/x/image/webp"
)

func TestQuarterTurnDirectionsAndStride(t *testing.T) {
	parent := image.NewNRGBA(image.Rect(0, 0, 9, 8))
	src := parent.SubImage(image.Rect(2, 3, 5, 5)).(*image.NRGBA)
	for y := 3; y < 5; y++ {
		for x := 2; x < 5; x++ {
			src.SetNRGBA(x, y, color.NRGBA{R: uint8(x * 40), G: uint8(y * 30), B: 17, A: 128})
		}
	}
	for _, clockwise := range []bool{true, false} {
		dst := quarterTurn(src, clockwise)
		if dst.Bounds().Size() != image.Pt(2, 3) {
			t.Fatal("incorrect dimensions")
		}
		for y := 0; y < 2; y++ {
			for x := 0; x < 3; x++ {
				dx, dy := 1-y, x
				if !clockwise {
					dx, dy = y, 2-x
				}
				if dst.NRGBAAt(dx, dy) != src.NRGBAAt(x+2, y+3) {
					t.Fatal("rotation changed pixel or alpha")
				}
			}
		}
	}
}

func TestQuarterTurnTileEdgesAndRGBA(t *testing.T) {
	parent := image.NewNRGBA(image.Rect(0, 0, 48, 70))
	sub := parent.SubImage(image.Rect(2, 3, 39, 68)).(*image.NRGBA)
	for y := 3; y < 68; y++ {
		for x := 2; x < 39; x++ {
			sub.SetNRGBA(x, y, color.NRGBA{R: uint8(x * 5), G: uint8(y * 3), B: 57, A: 128})
		}
	}
	rgba := image.NewRGBA(sub.Bounds())
	draw.Draw(rgba, rgba.Bounds(), sub, sub.Bounds().Min, draw.Src)
	for _, src := range []image.Image{sub, rgba} {
		bounds := src.Bounds()
		w, h := bounds.Dx(), bounds.Dy()
		for _, clockwise := range []bool{true, false} {
			dst := quarterTurn(src, clockwise)
			for y := 0; y < h; y++ {
				for x := 0; x < w; x++ {
					dx, dy := h-1-y, x
					if !clockwise {
						dx, dy = y, w-1-x
					}
					if dst.NRGBAAt(dx, dy) != color.NRGBAModel.Convert(src.At(bounds.Min.X+x, bounds.Min.Y+y)).(color.NRGBA) {
						t.Fatalf("pixel mismatch for %T at (%d,%d), clockwise=%v", src, x, y, clockwise)
					}
				}
			}
		}
	}
}

// Supply a local sample explicitly; the benchmark never edits that file.
func BenchmarkRotationPipeline(b *testing.B) {
	path := os.Getenv("ROTATION_BENCH_IMAGE")
	if path == "" {
		b.Skip("set ROTATION_BENCH_IMAGE to a representative WebP")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		b.Fatal(err)
	}
	img, err := xwebp.Decode(bytes.NewReader(raw))
	if err != nil {
		b.Fatal(err)
	}
	b.Logf("sample dimensions: %dx%d", img.Bounds().Dx(), img.Bounds().Dy())
	b.Run("decode", func(b *testing.B) {
		for b.Loop() {
			if _, err := xwebp.Decode(bytes.NewReader(raw)); err != nil {
				b.Fatal(err)
			}
		}
	})
	b.Run("turn", func(b *testing.B) {
		for b.Loop() {
			_ = quarterTurn(img, true)
		}
	})
	rotated := quarterTurn(img, true)
	for _, method := range []struct {
		name  string
		value int
	}{{"encode_method3", 3}, {"encode_method0", 0}} {
		b.Run(method.name, func(b *testing.B) {
			for b.Loop() {
				var out bytes.Buffer
				if err := webp.Encode(&out, rotated, webp.Options{Lossless: true, Exact: true, Method: method.value}); err != nil {
					b.Fatal(err)
				}
				b.ReportMetric(float64(out.Len()), "bytes/image")
			}
		})
	}
	b.Run("encode_method0_quality1", func(b *testing.B) {
		for b.Loop() {
			var out bytes.Buffer
			if err := webp.Encode(&out, rotated, webp.Options{Lossless: true, Exact: true, Method: 0, Quality: 1}); err != nil {
				b.Fatal(err)
			}
			b.ReportMetric(float64(out.Len()), "bytes/image")
		}
	})
}
