import { describe, expect, it } from "vitest";
import { renderBidclubRichText } from "../src/services/bidclubRichText";

describe("renderBidclubRichText", () => {
  it("renders Markdown emphasis, paragraphs, line breaks, and lists", () => {
    const html = renderBidclubRichText("**观点**：第一段\n仍在同一段。\n\n第二段。\n\n- 项目一\n- 项目二");

    expect(html).toContain("<strong>观点</strong>");
    expect(html).toContain("第一段<br>");
    expect(html).toContain("<p>第二段。</p>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>项目一</li>");
    expect(html).toContain("<li>项目二</li>");
    expect(html).not.toContain("**");
  });

  it("preserves existing HTML while rendering Markdown in mixed content", () => {
    const html = renderBidclubRichText("<h2>章节</h2>\n\n<p>HTML 段落</p>\n\n**Markdown 加粗**");

    expect(html).toContain("<h2>章节</h2>");
    expect(html).toContain("<p>HTML 段落</p>");
    expect(html).toContain("<strong>Markdown 加粗</strong>");
    expect(html).not.toContain("**");
  });

  it("renders inline Markdown inside an HTML paragraph", () => {
    const html = renderBidclubRichText("<p>**田渊栋的创业动因**是……</p>");

    expect(html).toContain("<p><strong>田渊栋的创业动因</strong>是……</p>");
    expect(html).not.toContain("**");
  });

  it("renders repeated emphasis across real list-item inline boundaries", () => {
    const html = renderBidclubRichText(
      '<ul><li>**SI/RSI 与 <span>Auto Research</span> 被孟繁青视为重要方向**，同时 **self-evolving、<a href="/search">Auto Search</a> 与 RSI 都可形式化**。已有<strong>加粗</strong>、<em>斜体</em>、<code>**代码**</code>。</li></ul>',
    );
    const container = document.createElement("div");
    container.innerHTML = html;
    const item = container.querySelector("li");

    expect(item).not.toBeNull();
    expect(item?.querySelectorAll("strong")).toHaveLength(3);
    expect(item?.querySelector("strong")?.textContent).toBe("SI/RSI 与 Auto Research 被孟繁青视为重要方向");
    expect(item?.querySelector("strong span")?.textContent).toBe("Auto Research");
    expect(item?.querySelector("strong a")?.textContent).toBe("Auto Search");
    expect(item?.querySelector("em")?.textContent).toBe("斜体");
    expect(item?.querySelector("code")?.textContent).toBe("**代码**");
    expect(item?.textContent).toContain("self-evolving、Auto Search 与 RSI 都可形式化");
    expect(item?.innerHTML).not.toContain("**SI/RSI");
    expect(item?.innerHTML).not.toContain("**self-evolving");
  });

  it("pairs a bold delimiter split across adjacent inline text nodes", () => {
    const html = renderBidclubRichText(
      '<ul><li><span>*</span>*跨节点观点<span>*</span>*，**第二组观点**</li></ul>',
    );
    const container = document.createElement("div");
    container.innerHTML = html;
    const item = container.querySelector("li");
    const strong = item?.querySelectorAll("strong");

    expect(strong).toHaveLength(2);
    expect(strong?.[0]?.textContent).toBe("跨节点观点");
    expect(strong?.[1]?.textContent).toBe("第二组观点");
    expect(item?.textContent).not.toContain("**");
  });

  it("keeps preformatted Markdown markers literal and sanitizes the final mixed result", () => {
    const html = renderBidclubRichText(
      '<ul><li>**安全观点** <a href="/search" onclick="alert(2)">链接</a> <pre><code>**预格式化**</code></pre><img src="x" onerror="alert(3)"></li></ul>',
    );
    const container = document.createElement("div");
    container.innerHTML = html;

    expect(container.querySelector("li strong")?.textContent).toBe("安全观点");
    expect(container.querySelector("a")?.getAttribute("href")).not.toContain("javascript:");
    expect(container.querySelector("a")?.getAttribute("onclick")).toBeNull();
    expect(container.querySelector("pre code")?.textContent).toBe("**预格式化**");
    expect(container.querySelector("pre strong")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("onerror")).toBeNull();
  });

  it("preserves a pure HTML document", () => {
    const html = renderBidclubRichText("<h2>节目简介</h2><p>这是<strong>整理后的</strong>内容。</p><ol><li>第一点</li></ol>");

    expect(html).toContain("<h2>节目简介</h2>");
    expect(html).toContain("<p>这是<strong>整理后的</strong>内容。</p>");
    expect(html).toContain("<ol><li>第一点</li></ol>");
  });

  it("splits newline-separated paragraphs inside an HTML p without touching structure", () => {
    const html = renderBidclubRichText(
      "<p><strong>观点</strong>：第一段\n第二段</p><h2>章节标题</h2><ul><li>列表一\n列表续行</li></ul><blockquote><p>引用一\n引用续行</p></blockquote>",
    );
    const container = document.createElement("div");
    container.innerHTML = html;

    const directParagraphs = Array.from(container.children)
      .filter((element) => element.tagName === "P")
      .map((element) => element.textContent);

    expect(directParagraphs).toEqual(["观点：第一段", "第二段"]);
    expect(container.querySelector("h2")?.textContent).toBe("章节标题");
    expect(container.querySelector("ul li")?.textContent).toBe("列表一\n列表续行");
    expect(container.querySelector("blockquote p")?.textContent).toBe("引用一\n引用续行");
  });

  it("renders newline-only text as readable paragraphs and line breaks", () => {
    const html = renderBidclubRichText("第一行\n第二行\n\n新的段落");

    expect(html).toContain("<p>第一行<br>第二行</p>");
    expect(html).toContain("<p>新的段落</p>");
  });

  it("sanitizes malicious HTML after Markdown rendering", () => {
    const html = renderBidclubRichText(
      '<p onclick="alert(1)">安全文字</p><script>alert(2)</script><a href="javascript:alert(3)">链接</a>',
    );

    expect(html).toContain("<p>安全文字</p>");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("script");
    expect(html).not.toContain("javascript:");
  });

  it("does not render inline Markdown inside code or pre contexts", () => {
    const html = renderBidclubRichText(
      '<p>正文 **加粗** <code>**代码**</code></p><pre><code>**预格式化**</code></pre>',
    );

    expect(html).toContain("正文 <strong>加粗</strong> <code>**代码**</code>");
    expect(html).toContain("<pre><code>**预格式化**</code></pre>");
  });

  it("returns an empty string for missing content", () => {
    expect(renderBidclubRichText()).toBe("");
    expect(renderBidclubRichText("")).toBe("");
  });
});
