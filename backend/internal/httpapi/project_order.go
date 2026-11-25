package httpapi

import "net/http"

type projectPosition struct {
	ID        int64 `json:"id"`
	SortOrder int   `json:"sort_order"`
}

func (a *Server) reorderProjects(w http.ResponseWriter, r *http.Request) {
	var input struct {
		IDs []int64 `json:"ids"`
	}
	if !decode(w, r, &input) {
		return
	}
	if len(input.IDs) < 2 || len(input.IDs) > 100 {
		fail(w, 400, "请提交 2–100 件作品的顺序")
		return
	}
	selected := make(map[int64]bool, len(input.IDs))
	for _, id := range input.IDs {
		if id < 1 || selected[id] {
			fail(w, 400, "作品编号无效或重复")
			return
		}
		selected[id] = true
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		serverError(w, err)
		return
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(r.Context(), "SELECT id,sort_order FROM contents WHERE kind='project' ORDER BY "+projectOrder+" FOR UPDATE")
	if err != nil {
		serverError(w, err)
		return
	}
	projects := []projectPosition{}
	slots := []int{}
	for rows.Next() {
		var project projectPosition
		if err = rows.Scan(&project.ID, &project.SortOrder); err != nil {
			rows.Close()
			serverError(w, err)
			return
		}
		if selected[project.ID] {
			slots = append(slots, len(projects))
		}
		projects = append(projects, project)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		serverError(w, err)
		return
	}
	if len(slots) != len(input.IDs) {
		fail(w, 404, "部分作品不存在，请刷新列表后重试")
		return
	}
	// 只替换本页或筛选结果占据的位置，其他作品保持原来的相对位置。
	ordered := make([]int64, len(projects))
	for i, project := range projects {
		ordered[i] = project.ID
	}
	for i, slot := range slots {
		ordered[slot] = input.IDs[i]
	}
	positions := make(map[int64]int, len(projects))
	for _, project := range projects {
		positions[project.ID] = project.SortOrder
	}
	items := make([]projectPosition, 0, len(input.IDs))
	for i, id := range ordered {
		// 统一为连续顺序，兼容已有作品重复或不连续的优先数字。
		if positions[id] != i {
			if _, err = tx.ExecContext(r.Context(), "UPDATE contents SET sort_order=?,updated_at=updated_at WHERE id=? AND kind='project'", i, id); err != nil {
				serverError(w, err)
				return
			}
		}
		if selected[id] {
			items = append(items, projectPosition{ID: id, SortOrder: i})
		}
	}
	if err = tx.Commit(); err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, map[string]any{"items": items})
}
