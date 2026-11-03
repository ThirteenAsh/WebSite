-- 仓库卡片的手动展示信息与 GitHub 同步数据独立保存，原有记录默认继续同步。
ALTER TABLE contents ADD COLUMN repo_overrides JSON NULL AFTER repo_updated_at;
