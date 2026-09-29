import { marked } from "marked";
import { sanitizeHtml } from "../utils/sanitizeHtml";

function splitPoint(root: Element, offset: number): [Text, number] | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  if (textNodes.length === 0) return null;

  let remaining = offset;
  for (const textNode of textNodes) {
    if (remaining <= textNode.data.length) {
      return [textNode, remaining];
    }
    remaining -= textNode.data.length;
  }

  const last = textNodes[textNodes.length - 1];
  return [last, last.data.length];
}

/**
 * Split only actual HTML paragraphs whose text contains multiple non-empty
 * newline-separated paragraphs. The DOM Range preserves inline markup while
 * leaving headings, lists, and quote blocks untouched.
 */
function normalizeHtmlParagraphs(html: string): string {
  if (typeof document === "undefined" || !html) return html;

  const template = document.createElement("template");
  template.innerHTML = html;

  for (const paragraph of Array.from(template.content.querySelectorAll("p"))) {
    if (paragraph.closest("blockquote, li, ul, ol")) continue;

    const text = paragraph.textContent || "";
    if (!/[\r\n]/.test(text)) continue;

    const ranges: Array<[number, number]> = [];
    const newline = /\r\n|[\r\n]/g;
    let start = 0;
    let match: RegExpExecArray | null;
    while ((match = newline.exec(text))) {
      if (text.slice(start, match.index).trim()) {
        ranges.push([start, match.index]);
      }
      start = match.index + match[0].length;
    }
    if (text.slice(start).trim()) ranges.push([start, text.length]);

    if (ranges.length < 2) continue;

    const parent = paragraph.parentNode;
    if (!parent) continue;

    for (const [rangeStart, rangeEnd] of ranges) {
      const startPoint = splitPoint(paragraph, rangeStart);
      const endPoint = splitPoint(paragraph, rangeEnd);
      if (!startPoint || !endPoint) continue;

      const range = document.createRange();
      range.setStart(startPoint[0], startPoint[1]);
      range.setEnd(endPoint[0], endPoint[1]);

      const nextParagraph = paragraph.cloneNode(false) as HTMLParagraphElement;
      nextParagraph.appendChild(range.cloneContents());
      parent.insertBefore(nextParagraph, paragraph);
    }

    paragraph.remove();
  }

  return template.innerHTML;
}

type ProtectedContext = {
  token: string;
  html: string;
};

function protectMarkdownContexts(html: string): [string, ProtectedContext[]] {
  if (typeof document === "undefined" || !html) return [html, []];

  const template = document.createElement("template");
  template.innerHTML = html;
  const contexts: ProtectedContext[] = [];
  let index = 0;

  for (const element of Array.from(template.content.querySelectorAll("pre, code"))) {
    if (element.parentElement?.closest("pre, code")) continue;

    const token = `__BIDCLUB_PROTECTED_CONTEXT_${index++}__`;
    contexts.push({ token, html: element.innerHTML });
    element.replaceChildren(document.createTextNode(token));
  }

  return [template.innerHTML, contexts];
}

function restoreMarkdownContexts(html: string, contexts: ProtectedContext[]): string {
  if (typeof document === "undefined" || !html || contexts.length === 0) return html;

  const template = document.createElement("template");
  template.innerHTML = html;

  for (const context of contexts) {
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      const textNode = current as Text;
      if (textNode.data === context.token) {
        const content = document.createElement("template");
        content.innerHTML = context.html;
        textNode.replaceWith(content.content);
        break;
      }
      current = walker.nextNode();
    }
  }

  return template.innerHTML;
}

const markdownBlockSelector = "p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th";

function isProtectedMarkdownContext(textNode: Text): boolean {
  return Boolean(textNode.parentElement?.closest("code, pre, script, style"));
}

function collectMarkdownTextRuns(root: Node): Text[][] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const runs: Text[][] = [];
  let run: Text[] = [];
  let current = walker.nextNode();

  while (current) {
    const textNode = current as Text;
    if (isProtectedMarkdownContext(textNode)) {
      if (run.length > 0) runs.push(run);
      run = [];
    } else {
      run.push(textNode);
    }
    current = walker.nextNode();
  }

  if (run.length > 0) runs.push(run);
  return runs;
}

function findBoldMarkerPair(textNodes: Text[]): [number, number] | null {
  const text = textNodes.map((textNode) => textNode.data).join("");
  const opening = text.indexOf("**");
  if (opening < 0) return null;

  const closing = text.indexOf("**", opening + 2);
  if (closing <= opening + 2) return null;

  return [opening, closing];
}

function pointAtTextOffset(textNodes: Text[], offset: number): [Text, number] | null {
  let remaining = offset;
  for (const textNode of textNodes) {
    if (remaining <= textNode.data.length) return [textNode, remaining];
    remaining -= textNode.data.length;
  }

  const last = textNodes[textNodes.length - 1];
  return last ? [last, last.data.length] : null;
}

function removeCharacters(root: Node, count: number, fromEnd: boolean): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    const textNode = current as Text;
    if (!isProtectedMarkdownContext(textNode)) textNodes.push(textNode);
    current = walker.nextNode();
  }

  let remaining = count;
  const orderedNodes = fromEnd ? textNodes.reverse() : textNodes;
  for (const textNode of orderedNodes) {
    if (remaining === 0) break;
    const removed = Math.min(remaining, textNode.data.length);
    if (fromEnd) {
      textNode.deleteData(textNode.data.length - removed, removed);
    } else {
      textNode.deleteData(0, removed);
    }
    remaining -= removed;
  }
}

/**
 * Render paired ** markers even when HTML inline elements split the marker's
 * text across several DOM text nodes. Range extraction keeps existing inline
 * elements and their attributes intact, while code/pre runs are excluded.
 */
function renderCrossNodeBoldMarkers(scope: Node): void {
  for (;;) {
    let changed = false;
    for (const textNodes of collectMarkdownTextRuns(scope)) {
      const pair = findBoldMarkerPair(textNodes);
      if (!pair) continue;

      const [opening, closing] = pair;
      const start = pointAtTextOffset(textNodes, opening);
      const end = pointAtTextOffset(textNodes, closing + 2);
      if (!start || !end) continue;

      const range = document.createRange();
      range.setStart(start[0], start[1]);
      range.setEnd(end[0], end[1]);
      const contents = range.extractContents();

      removeCharacters(contents, 2, false);
      removeCharacters(contents, 2, true);

      const strong = document.createElement("strong");
      strong.appendChild(contents);
      range.insertNode(strong);
      changed = true;
      break;
    }

    if (!changed) return;
  }
}

function renderInlineMarkdown(html: string): string {
  if (typeof document === "undefined" || !html) return html;

  const template = document.createElement("template");
  template.innerHTML = html;

  const scopes: Node[] = [];
  const scopeWalker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  let scopeCurrent = scopeWalker.nextNode();
  while (scopeCurrent) {
    const textNode = scopeCurrent as Text;
    const scope = textNode.parentElement?.closest(markdownBlockSelector) || template.content;
    if (!scopes.includes(scope)) scopes.push(scope);
    scopeCurrent = scopeWalker.nextNode();
  }

  for (const scope of scopes) renderCrossNodeBoldMarkers(scope);

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const textNode of textNodes) {
    if (textNode.parentElement?.closest("code, pre, script, style")) continue;

    const rendered = marked.parseInline(textNode.data, {
      breaks: false,
      gfm: true,
    });
    if (typeof rendered !== "string" || rendered === textNode.data) continue;

    const replacement = document.createElement("template");
    replacement.innerHTML = rendered;
    textNode.replaceWith(replacement.content);
  }

  return template.innerHTML;
}

/**
 * Render BidClub's already-curated rich text without changing its wording.
 *
 * BidClub content can contain Markdown, HTML, or both. Markdown is converted
 * first so that the result has one consistent HTML representation; the
 * resulting HTML is then passed through the app's existing sanitizer before
 * it can be inserted into the DOM.
 */
export function renderBidclubRichText(value?: string): string {
  if (!value) return "";

  const safeSource = sanitizeHtml(value);
  const [protectedSource, protectedContexts] = protectMarkdownContexts(safeSource);
  const rendered = marked.parse(protectedSource, {
    breaks: true,
    gfm: true,
  });

  const restored = restoreMarkdownContexts(typeof rendered === "string" ? rendered : "", protectedContexts);
  const sanitized = sanitizeHtml(restored);
  const normalized = normalizeHtmlParagraphs(sanitized);
  const withInlineMarkdown = renderInlineMarkdown(normalized);
  return sanitizeHtml(withInlineMarkdown);
}
