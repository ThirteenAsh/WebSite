import { marked } from "marked";
import DOMPurify from "dompurify";
import type { Content } from "./types";

export function renderMarkdown(source: string) {
  return DOMPurify.sanitize(
    marked.parse(source || "", { async: false, gfm: true, breaks: true }),
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
