package httpapi

import (
	"database/sql"
	"sync"
	"time"

	"thirteenash/internal/config"
	"thirteenash/internal/github"
)

type Server struct {
	db       *sql.DB
	cfg      config.Server
	github   *github.Client
	syncMu   sync.Mutex
	loginMu  sync.Mutex
	attempts map[string]loginAttempt
}
type loginAttempt struct {
	Count int
	Since time.Time
}
type sessionContext struct {
	ID             int64
	Username, CSRF string
}
type ctxKey string

const sessionKey ctxKey = "session"

// New constructs the HTTP API with explicit configuration and external dependencies.
func New(db *sql.DB, cfg config.Server, client *github.Client) *Server {
	if client == nil {
		client = github.NewClient("")
	}
	return &Server{db: db, cfg: cfg, github: client, attempts: map[string]loginAttempt{}}
}
