package httpapi

import (
	"bytes"
	"image"
	"image/color"
	"testing"

	"golang.org/x/image/webp"
)

func TestEncodeUploadPreservesScreenshotAlpha(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 32, 160))
	want := color.NRGBA{R: 230, G: 110, B: 20, A: 128}
	img.SetNRGBA(7, 10, want)

	data, size, err := encodeUpload(t.Context(), img, "png")
	if err != nil {
		t.Fatal(err)
	}
	if size != img.Bounds().Size() || len(data) > targetImageBytes {
		t.Fatalf("unexpected output size: %v, %d bytes", size, len(data))
	}
	decoded, err := webp.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	if got := color.NRGBAModel.Convert(decoded.At(7, 10)); got != want {
		t.Fatalf("lossless screenshot changed a translucent pixel: got %v, want %v", got, want)
	}
}

func TestEncodeUploadResizesOversizedPhoto(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 4096, 1024))
	for i := 3; i < len(img.Pix); i += 4 {
		img.Pix[i] = 255
	}
	data, size, err := encodeUpload(t.Context(), img, "jpeg")
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := webp.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	if size != image.Pt(2048, 512) || image.Pt(cfg.Width, cfg.Height) != size {
		t.Fatalf("output dimensions do not match the resized photo: %v, %d × %d", size, cfg.Width, cfg.Height)
	}
}
