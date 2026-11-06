-- ThirteenAsh 数据库结构；先选中为本站创建的数据库，再执行本文件。
-- MySQL 8.0+；全部表使用 utf8mb4 / InnoDB。不删除、不清空已有数据。
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS admins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  admin_id BIGINT UNSIGNED NOT NULL,
  csrf_token CHAR(64) CHARACTER SET ascii NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  INDEX idx_session_expiry (expires_at),
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  payload JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('project','article','moment') NOT NULL,
  label VARCHAR(1000) NOT NULL DEFAULT '',
  title VARCHAR(200) NOT NULL DEFAULT '',
  summary TEXT NOT NULL,
  body MEDIUMTEXT NOT NULL,
  cover_url VARCHAR(1000) NOT NULL DEFAULT '',
  images JSON NOT NULL,
  tech_stack JSON NOT NULL,
  status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  repo_id BIGINT NULL UNIQUE,
  repo_full_name VARCHAR(255) NOT NULL DEFAULT '',
  repo_name VARCHAR(255) NOT NULL DEFAULT '',
  repo_description TEXT NOT NULL,
  repo_language VARCHAR(100) NOT NULL DEFAULT '',
  repo_url VARCHAR(1000) NOT NULL DEFAULT '',
  repo_updated_at DATETIME(6) NULL,
  demo_url VARCHAR(1000) NOT NULL DEFAULT '',
  docs_url VARCHAR(1000) NOT NULL DEFAULT '',
  release_url VARCHAR(1000) NOT NULL DEFAULT '',
  view_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  like_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  published_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  INDEX idx_public_list (status, kind, published_at, id),
  INDEX idx_featured (status, featured, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 去重依据是随机浏览器 Cookie 的 SHA-256，不记录 IP 地址。
CREATE TABLE IF NOT EXISTS content_likes (
  content_id BIGINT UNSIGNED NOT NULL,
  visitor_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (content_id, visitor_hash),
  FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_views (
  content_id BIGINT UNSIGNED NOT NULL,
  visitor_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  last_view_at DATETIME(6) NOT NULL,
  PRIMARY KEY (content_id, visitor_hash),
  INDEX idx_view_time (last_view_at),
  FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS uploads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(100) NOT NULL UNIQUE,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  size_bytes BIGINT NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_state (
  state_key VARCHAR(100) NOT NULL PRIMARY KEY,
  state_value TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
