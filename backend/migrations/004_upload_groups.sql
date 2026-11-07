ALTER TABLE uploads
  ADD COLUMN content_id BIGINT UNSIGNED NULL,
  ADD COLUMN upload_key CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD INDEX idx_upload_content (content_id, id),
  ADD UNIQUE INDEX idx_upload_key (upload_key),
  ADD CONSTRAINT fk_upload_content FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE SET NULL;
