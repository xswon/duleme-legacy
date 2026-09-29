import DOMPurify from "dompurify";

const BLOCKED_TAGS = [
  "base", "button", "embed", "form", "iframe", "input", "link", "math", "meta",
  "noembed", "noframes", "noscript", "object", "option", "script", "select", "style", "svg", "textarea", "xmp",
];

const BLOCKED_ATTRIBUTES = [
  "formaction", "nonce", "ping", "srcdoc", "srcset", "style",
];

function isSafeLink(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return false;
  if (/^(?:https?:|mailto:|tel:)/i.test(candidate)) return true;
  return /^(?:[#?]|\.{0,2}\/|\/)/.test(candidate);
}

function isSafeResource(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return false;
  if (/^(?:https?:|blob:)/i.test(candidate)) return true;
  if (/^data:image\/(?:avif|gif|jpeg|png|webp);base64,/i.test(candidate)) return true;
  return /^(?:\.{0,2}\/|\/)/.test(candidate);
}

/** Sanitize untrusted RSS/Markdown HTML before inserting it into the DOM. */
export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined" || typeof document === "undefined") return "";

  const clean = String(DOMPurify.sanitize(html || "", {
    USE_PROFILES: { html: true },
    FORBID_TAGS: BLOCKED_TAGS,
    FORBID_ATTR: BLOCKED_ATTRIBUTES,
    ALLOW_DATA_ATTR: false,
    SANITIZE_DOM: true,
    SANITIZE_NAMED_PROPS: true,
  }));

  const template = document.createElement("template");
  template.innerHTML = clean;

  for (const element of Array.from(template.content.querySelectorAll<HTMLElement>("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.toLowerCase().startsWith("on")) element.removeAttribute(attribute.name);
    }
  }

  for (const anchor of Array.from(template.content.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    if (!isSafeLink(anchor.getAttribute("href") || "")) {
      anchor.removeAttribute("href");
      anchor.removeAttribute("target");
      anchor.removeAttribute("rel");
      continue;
    }
    if (anchor.target === "_blank") anchor.rel = "noopener noreferrer";
  }

  for (const element of Array.from(template.content.querySelectorAll<HTMLElement>("[src]"))) {
    if (!isSafeResource(element.getAttribute("src") || "")) element.removeAttribute("src");
  }

  return template.innerHTML;
}
