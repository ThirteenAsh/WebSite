package model

// DefaultSiteSettings 同时用于新站点初始化和旧设置缺少字段时的默认值。
func DefaultSiteSettings() SiteSettings {
	return SiteSettings{
		Name:           "ThirteenAsh",
		Tagline:        "构建 · 学习 · 记录",
		HeroTitle:      "把想法写成代码，",
		HeroHighlight:  "把过程留在这里。",
		Intro:          "我只是一个普通的大学生。\n这里整理我的作品，也记录学习和生活中的片刻。",
		About:          "我是 ThirteenAsh，热爱编程。这里是我的个人空间，代码、项目、技术笔记，以及日常里值得留下的小事。",
		AvatarURL:      "/avatar.jpg",
		GitHubUsername: "ThirteenAsh",
		GitHubURL:      "https://github.com/ThirteenAsh",
		Skills:         []string{"Java / Spring", "Vue / TypeScript", "Rust / Tauri", "Python / AI"},
		CopyrightText:  "bytecraft.com.cn",
		ICPNumber:      "陕ICP备2025084108号-1",
		ICPURL:         "https://beian.miit.gov.cn/",
		PoliceNumber:   "陕公网安备 61012502000363号",
		PoliceURL:      "https://beian.mps.gov.cn/#/query/webSearch?code=61012502000363",
	}
}
