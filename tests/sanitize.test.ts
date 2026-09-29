import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "../src/utils/sanitizeHtml";

describe("sanitizeHtml", () => {
  it("removes executable elements and event handlers", () => {
    const html = sanitizeHtml('<p onclick="alert(1)">ok</p><script>alert(2)</script><img src="javascript:alert(3)">');
    expect(html).toContain("<p>ok</p>");
    expect(html).not.toContain("script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
  });

  it("blocks embedded document, form, and namespace payloads", () => {
    const html = sanitizeHtml('<svg><a xlink:href="javascript:alert(1)">svg</a></svg><math><mi>x</mi></math><iframe srcdoc="<script>alert(1)</script>"></iframe><form action="https://evil.example"><input name="password"></form><object data="https://evil.example/payload"></object><p>safe</p>');
    expect(html).toContain("<p>safe</p>");
    expect(html).not.toMatch(/svg|math|iframe|srcdoc|form|input|object|xlink/i);
  });

  it("allows reader URLs while rejecting active and HTML data URLs", () => {
    const html = sanitizeHtml('<a href="https://example.com/article" target="_blank">article</a><a href="/relative">relative</a><a href="javascript:alert(1)">bad-js</a><a href="data:text/html,bad">bad-data</a><img src="https://cdn.example.com/image.jpg" srcset="https://cdn.example.com/a.jpg 1x"><img src="data:image/png;base64,iVBORw0KGgo="><img src="data:text/html,bad">');
    expect(html).toContain('href="https://example.com/article"');
    expect(html).not.toContain('target="_blank"');
    expect(html).toContain('href="/relative"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    expect(html).not.toContain("srcset");
    expect(html).toContain("data:image/png;base64");
  });

  it("drops inline CSS and data attributes", () => {
    const html = sanitizeHtml('<div style="position:fixed" data-overlay="1" onpointerenter="alert(1)">content</div>');
    expect(html).toBe("<div>content</div>");
  });
});
