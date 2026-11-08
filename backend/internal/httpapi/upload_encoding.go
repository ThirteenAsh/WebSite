package httpapi

import (
	"bytes"
	"context"
	"image"
	"image/draw"

	"github.com/gen2brain/webp"
	xdraw "golang.org/x/image/draw"
)

const (
	targetImageBytes  = 500_000
	photoMaxSide      = 2048
	losslessMaxPixels = 4_000_000
)

// Bound the working memory of the embedded encoder across simultaneous requests.
var imageEncodingSlot = make(chan struct{}, 2)

func encodeUpload(ctx context.Context, img image.Image, format string) ([]byte, image.Point, error) {
	size := img.Bounds().Size()
	if format == "jpeg" {
		longest := max(size.X, size.Y)
		if longest > photoMaxSide {
			size = image.Pt(max(1, size.X*photoMaxSide/longest), max(1, size.Y*photoMaxSide/longest))
			resized := image.NewRGBA(image.Rectangle{Max: size})
			xdraw.CatmullRom.Scale(resized, resized.Bounds(), img, img.Bounds(), draw.Src, nil)
			img = resized
		}
	}
	// WebP expects straight alpha, while RGBA stores premultiplied channels.
	if rgba, ok := img.(*image.RGBA); ok && !rgba.Opaque() {
		straight := image.NewNRGBA(image.Rectangle{Max: size})
		draw.Draw(straight, straight.Bounds(), rgba, rgba.Bounds().Min, draw.Src)
		img = straight
	}

	var output bytes.Buffer
	if format != "jpeg" && size.X*size.Y <= losslessMaxPixels {
		if err := webp.Encode(&output, img, webp.Options{Lossless: true, Method: 3}); err != nil {
			return nil, size, err
		}
		if output.Len() <= targetImageBytes {
			return output.Bytes(), size, nil
		}
	}
	// Keep screenshot dimensions. If the lowest quality still exceeds the
	// target, store that encoded result subject to the existing hard size limit.
	for _, quality := range []int{92, 86, 80} {
		if err := ctx.Err(); err != nil {
			return nil, size, err
		}
		output.Reset()
		if err := webp.Encode(&output, img, webp.Options{Quality: quality, Method: 4}); err != nil {
			return nil, size, err
		}
		if output.Len() <= targetImageBytes {
			break
		}
	}
	return output.Bytes(), size, nil
}
