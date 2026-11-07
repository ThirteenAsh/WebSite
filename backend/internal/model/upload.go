package model

import (
	"time"
)

type Upload struct {
	ID           int64     `json:"id"`
	Filename     string    `json:"filename"`
	OriginalName string    `json:"original_name"`
	MIME         string    `json:"mime_type"`
	Size         int64     `json:"size_bytes"`
	Width        int       `json:"width"`
	Height       int       `json:"height"`
	CreatedAt    time.Time `json:"created_at"`
	URL          string    `json:"url"`
	ContentID    *int64    `json:"content_id"`
}
