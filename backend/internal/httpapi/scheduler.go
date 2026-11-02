package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"time"
)

func (a *Server) RunScheduler(ctx context.Context) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	run := func() {
		ran, err := a.runScheduled(ctx, time.Now())
		if err != nil {
			log.Printf("定时维护失败: %v", err)
		} else if ran {
			log.Print("每日 GitHub 同步完成，结果已保存")
		}
	}
	run()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			run()
		}
	}
}

func syncDue(now time.Time, previous syncResult, hour int, loc *time.Location) bool {
	local := now.In(loc)
	return local.Hour() >= hour && (previous.At.IsZero() || previous.At.In(loc).Format("2006-01-02") != local.Format("2006-01-02"))
}

// 启动时和每分钟检查一次；已完成的当天任务不会因服务重启重复执行。
func (a *Server) runScheduled(ctx context.Context, now time.Time) (bool, error) {
	if _, err := a.db.ExecContext(ctx, "DELETE FROM sessions WHERE expires_at<UTC_TIMESTAMP(6)"); err != nil {
		return false, err
	}
	if _, err := a.db.ExecContext(ctx, "DELETE FROM content_views WHERE last_view_at<UTC_TIMESTAMP(6)-INTERVAL 1 DAY"); err != nil {
		return false, err
	}
	var raw string
	err := a.db.QueryRowContext(ctx, "SELECT state_value FROM app_state WHERE state_key='github_sync'").Scan(&raw)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return false, err
	}
	var previous syncResult
	_ = json.Unmarshal([]byte(raw), &previous)
	if !syncDue(now, previous, a.cfg.SyncHour, a.cfg.Location) {
		return false, nil
	}
	job, cancel := context.WithTimeout(ctx, 100*time.Second)
	defer cancel()
	_, err = a.syncRepos(job, "daily")
	return true, err
}
