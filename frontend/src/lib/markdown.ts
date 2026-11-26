import { Marked } from "marked";
import DOMPurify from "dompurify";
import { formatDate, type Content, type UploadGroup } from "./types";

const markdown = new Marked({
  hooks: {
    emStrongMask(source) {
      // 允许「标点 + ** + 汉字」处的星号结束加粗。只调整查找边界的副本，保持字符位置。
      return source.replace(
        /(?![*_\\])\p{P}(?=\*{2,}\p{Script=Han})/gu,
        (punctuation) => "字".repeat(punctuation.length),
      );
    },
  },
});

export function renderMarkdown(source: string) {
  return DOMPurify.sanitize(
    markdown.parse(source || "", { async: false, gfm: true, breaks: true }),
    {
      USE_PROFILES: { html: true },
      FORBID_TAGS: [
        "style",
        "form",
        "input",
        "button",
        "video",
        "audio",
        "iframe",
      ],
      FORBID_ATTR: ["style"],
    },
  );
}
export function markdownExcerpt(source: string, limit = 160) {
  const element = document.createElement("div");
  element.innerHTML = renderMarkdown(source);
  return (element.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}
export function contentDescription(c: Content) {
  return c.kind === "moment"
    ? markdownExcerpt(c.body, 60) || `${c.images.length} 张图片`
    : c.title;
}
export function uploadGroupName(group: UploadGroup) {
  if (group.kind !== "moment") return group.title;
  const text = Array.from(markdownExcerpt(group.body_preview || "", 200));
  const excerpt = text.length
    ? `${text.slice(0, 20).join("")}${text.length > 20 ? "…" : ""}`
    : `${group.image_count || 0} 张图片`;
  return `${formatDate(group.created_at)} · ${excerpt}`;
}
