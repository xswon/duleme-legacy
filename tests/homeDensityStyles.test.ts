import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const navigationStyles = readFileSync(resolve(process.cwd(), "src/styles/prototype-navigation.css"), "utf8");

describe("home density styles", () => {
  it("uses the reviewed responsive layout thresholds", () => {
    expect(styles).toContain("@media (min-width: 900px) and (max-width: 1279px)");
    expect(styles).toContain("--wreader-list: 352px;");
    expect(styles).toContain("@media (min-width: 1280px)");
    expect(styles).not.toContain("@media (min-width: 1040px)");
  });

  it("uses the prototype timeline title weights", () => {
    const titleRuleStart = styles.indexOf(".wreader-article-list .wreader-story-row h2 {");
    const titleRuleEnd = styles.indexOf(".wreader-article-list .wreader-story-row p {", titleRuleStart);
    const titleRules = styles.slice(titleRuleStart, titleRuleEnd);

    expect(titleRules).toContain("font-weight: 750;");
    expect(styles).toContain(".wreader-story-row.is-selected:not(.is-read) h2 {");
    expect(styles).toContain("font-weight: 750;");
    expect(styles).toContain(".wreader-article-list .wreader-story-row.is-read h2 {");
    expect(styles).toContain("font-weight: 500;");
  });

  it("only bolds selected sidebar navigation items", () => {
    expect(styles).toMatch(/\.wreader-sidebar nav button \{\s*font-weight: 400;/);
    expect(styles).toMatch(/\.wreader-sidebar nav button\.bg-slate-200\\\/80,[\s\S]*?font-weight: 700;/);
    expect(styles).toMatch(/\.wreader-reading-nav button > span\.wreader-nav-count \{[\s\S]*?font-weight: inherit;/);
  });

  it("uses the prototype spacing between sidebar modules", () => {
    expect(styles).toMatch(/\.wreader-tools-label \{\s*margin-top: 20px;/);
    expect(styles).toMatch(/\.wreader-subscription-section \{\s*margin-top: 20px;/);
    expect(styles).toMatch(/\.wreader-subscription-heading \{[\s\S]*?padding-right: 0 !important;/);
  });

  it("uses the prototype sidebar headings and feed icon geometry", () => {
    const headingStart = styles.indexOf(".wreader-nav-section-label {");
    const headingEnd = styles.indexOf("}", headingStart);
    const headingRule = styles.slice(headingStart, headingEnd);
    expect(headingRule).toContain("color: #687586;");
    expect(headingRule).toContain("font-size: 11px;");
    expect(styles).toMatch(/\.wreader-feed-avatar \{[\s\S]*?min-width: 16px;[\s\S]*?max-width: 16px;[\s\S]*?border-radius: 5px !important;/);
    expect(navigationStyles).toMatch(/\.wreader-sidebar-search svg \{ width: 16px; height: 16px; \}/);
    expect(styles).toMatch(/\.wreader-nav-selected-label \{[\s\S]*?color: #1f64ba !important;[\s\S]*?font-weight: 700 !important;/);
    expect(styles).toMatch(/\.wreader-nav-name \{\s*font-size: 12px;\s*\}/);
    expect(styles).toMatch(/\.wreader-nav-primary-label \{\s*font-size: 12px;\s*\}/);
    expect(styles).toMatch(/\.wreader-reading-nav button > span\.wreader-nav-count \{\s*font-size: 11px;\s*font-weight: inherit;\s*\}/);
    expect(styles).not.toContain(".wreader-reading-nav button > span:last-child");
  });

  it("indents feeds beneath their folders", () => {
    expect(styles).toMatch(/\.wreader-feed-row \{\s*padding-left: 24px !important;/);
  });

  it("keeps the settings action anchored while only the navigation area scrolls", () => {
    expect(styles).toMatch(/\.wreader-sidebar \{[\s\S]*?height: 100dvh;[\s\S]*?max-height: 100dvh;[\s\S]*?overflow: hidden;/);
    expect(styles).toMatch(/\.wreader-sidebar-scroll \{[\s\S]*?flex: 1 1 auto;[\s\S]*?overflow-y: auto;/);
    expect(styles).toMatch(/\.wreader-sidebar-footer \{[\s\S]*?flex: 0 0 auto;[\s\S]*?padding: 0 10px max\(32px, env\(safe-area-inset-bottom\)\);/);
  });
});
