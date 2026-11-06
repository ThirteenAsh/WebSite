package httpapi

import (
	"strings"
	"testing"

	"thirteenash/internal/model"
)

func TestNormalizeLineTags(t *testing.T) {
	for _, tc := range []struct{ input, want string }{
		{"Linux", "Linux"},
		{"  Linux \r\n\r\n 操作系统 \nLinux\rVue  ", "Linux\n操作系统\nVue"},
		{"C++ / Qt\nJava, Kotlin", "C++ / Qt\nJava, Kotlin"},
		{" \r\n\t", ""},
	} {
		got, valid := normalizeLineTags(tc.input, 20, 40)
		if !valid || got != tc.want {
			t.Fatalf("normalizeLineTags(%q) = %q, %v; want %q", tc.input, got, valid, tc.want)
		}
	}
}

func TestMultilineContentTags(t *testing.T) {
	for _, kind := range []string{"article", "project"} {
		c := model.Content{Kind: kind, Title: "多标签", Status: "draft", Label: strings.Repeat("标", 40) + "\n" + strings.Repeat("记", 40)}
		if err := validateContent(&c); err != nil {
			t.Fatalf("%s 多项合计超过 40 字应允许: %v", kind, err)
		}
		for _, invalid := range []string{strings.Repeat("标", 41), strings.Join(strings.Fields("1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21"), "\n")} {
			c.Label = invalid
			if validateContent(&c) == nil {
				t.Fatalf("超长或过多标签通过校验: %q", invalid)
			}
		}
	}
}

func TestMultilineRepoLanguages(t *testing.T) {
	languages := strings.Repeat("语", 100) + "\r\n" + strings.Repeat("言", 100)
	want := strings.ReplaceAll(languages, "\r\n", "\n")
	v := model.RepoOverrides{Language: &languages}
	if err := validateRepoOverrides(&v); err != nil || *v.Language != want {
		t.Fatalf("每项不超过 100 字的多语言应允许: %v", err)
	}
	tooLong := strings.Repeat("语", 101)
	if validateRepoOverrides(&model.RepoOverrides{Language: &tooLong}) == nil {
		t.Fatal("超长语言通过校验")
	}
	blank := " \r\n "
	v.Language = &blank
	if err := validateRepoOverrides(&v); err != nil || v.Language == nil || *v.Language != "" {
		t.Fatal("空字符串应继续表示隐藏语言")
	}
	v.Language = nil
	if err := validateRepoOverrides(&v); err != nil || v.Language != nil {
		t.Fatal("空指针应继续表示跟随 GitHub")
	}
}
