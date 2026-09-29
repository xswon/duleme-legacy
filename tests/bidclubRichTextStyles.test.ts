import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const surfaceRuleStart = styles.indexOf(".bidclub-overview,\n.bidclub-digest {");
const surfaceRuleEnd = styles.indexOf("/* BidClub headings", surfaceRuleStart);
const bidClubSurfaceRule = styles.slice(surfaceRuleStart, surfaceRuleEnd);
const headingRuleStart = styles.indexOf(".bidclub-overview h1,");
const headingRuleEnd = styles.indexOf("/* BidClub highlights", headingRuleStart);
const bidClubHeadingRule = styles.slice(headingRuleStart, headingRuleEnd);
const overviewListRuleStart = styles.indexOf(".bidclub-overview ul,");
const overviewListRuleEnd = styles.indexOf(".bidclub-overview li {", overviewListRuleStart);
const bidClubOverviewListRule = styles.slice(overviewListRuleStart, overviewListRuleEnd);
const overviewItemRuleStart = styles.indexOf(".bidclub-overview li {");
const overviewItemRuleEnd = styles.indexOf(".bidclub-overview li::before", overviewItemRuleStart);
const bidClubOverviewItemRule = styles.slice(overviewItemRuleStart, overviewItemRuleEnd);
const overviewMarkerRuleStart = styles.indexOf(".bidclub-overview li::before");
const overviewMarkerRuleEnd = styles.indexOf("/* BidClub digests", overviewMarkerRuleStart);
const bidClubOverviewMarkerRule = styles.slice(overviewMarkerRuleStart, overviewMarkerRuleEnd);
const mobileRuleStart = styles.indexOf("@media (max-width: 640px)");
const mobileRuleEnd = styles.indexOf(".reader-content blockquote", mobileRuleStart);
const bidClubMobileRule = styles.slice(mobileRuleStart, mobileRuleEnd);

describe("BidClub rich text styles", () => {
  it("inherits reader typography instead of adding a BidClub body treatment", () => {
    expect(bidClubSurfaceRule).not.toContain("background:");
    expect(bidClubSurfaceRule).not.toContain("font-family:");
    expect(bidClubSurfaceRule).not.toContain("font-size:");
    expect(bidClubSurfaceRule).not.toContain("line-height:");
    expect(bidClubSurfaceRule).not.toContain("color:");
    expect(styles).toContain(".reader-content {");
    expect(styles).toContain("font-size: 16px;");
    expect(styles).toContain("line-height: 1.8;");
    expect(styles).toContain("color: var(--color-slate-800);");
  });

  it("uses a single guttered dot only for real overview list items", () => {
    expect(bidClubOverviewListRule).toContain(".bidclub-overview ul,");
    expect(bidClubOverviewListRule).toContain(".bidclub-overview ol {");
    expect(bidClubOverviewListRule).toContain("list-style: none;");
    expect(bidClubOverviewListRule).toContain("padding-inline-start: 0;");
    expect(bidClubOverviewListRule.match(/padding-inline-start:/g)).toHaveLength(1);
    expect(bidClubOverviewListRule).not.toContain("padding-left:");

    expect(bidClubOverviewItemRule).toContain("padding-inline-start: 0;");
    expect(styles).toContain(".bidclub-overview li:has(> strong:first-child),");
    expect(styles).toContain(".bidclub-overview li:has(> p:first-child > strong:first-child)::before");
    expect(styles).toContain("padding-inline-start: 1.45em;");

    expect(styles.match(/\.bidclub-overview li::(?:before|after)/g)).toEqual([
      ".bidclub-overview li::before",
    ]);
    expect(styles).toContain('.bidclub-overview li::before {\n  content: none;');
    expect(bidClubOverviewMarkerRule).toContain('content: "";');
    expect(bidClubOverviewMarkerRule).toContain("position: absolute;");
    expect(bidClubOverviewMarkerRule).toContain("left: 0.15em;");
    expect(bidClubOverviewMarkerRule).toContain("top: 0.85em;");
    expect(bidClubOverviewMarkerRule).toContain("width: 0.42em;");
    expect(bidClubOverviewMarkerRule).toContain("height: 0.42em;");
    expect(bidClubOverviewMarkerRule).toContain("border-radius: 999px;");
    expect(bidClubOverviewMarkerRule).toContain("background: var(--color-violet-500);");
    expect(styles).toContain(".bidclub-overview strong,");
    expect(styles).toContain(".bidclub-overview b {");
    expect(bidClubOverviewMarkerRule).toContain("font-size: inherit;");
    expect(bidClubOverviewMarkerRule).toContain("line-height: 1.45;");

    expect(styles).not.toContain(".bidclub-overview p::before");
    expect(styles).not.toContain(".bidclub-overview p::after");
    expect(styles).not.toContain("--bidclub-accent");
    expect(styles).not.toContain(".bidclub-overview > p > strong:first-child::before");
    expect(styles).not.toContain(".bidclub-overview > p > b:first-child::before");
    expect(styles).not.toContain('content: "▸"');
    expect(styles).not.toContain('content: "▸ ";');

    expect(styles).toContain(".reader-content strong,");
    expect(styles).toContain(".reader-content b {");
    expect(styles).toContain("font-weight: 600;");
  });

  it("keeps enrichment titles readable in the slate UI", () => {
    expect(styles).toContain(".bidclub-overview h1,");
    expect(styles).toContain(".bidclub-digest h3 {");
    expect(styles).toContain("border-left: none;");
    expect(styles).toContain("font-size: 18px;");
    expect(styles).toContain("font-weight: 700;");
    expect(styles).toContain("color: var(--color-slate-900);");
    expect(bidClubHeadingRule).not.toContain("line-height:");
    expect(styles).not.toContain("border-left: 3px solid var(--color-blue-600)");
  });

  it("keeps neutral digest paragraph markers separate from authored lists and quotes", () => {
    expect(styles).toContain('.bidclub-digest p:not(:is(li p, blockquote p))::before');
    expect(styles).not.toContain('.bidclub-digest p::before');
    expect(styles).not.toContain('.bidclub-digest h1::before');
    expect(styles).not.toContain('.bidclub-digest h2::before');
    expect(styles).not.toContain('.bidclub-digest h3::before');
    expect(styles).not.toContain('.bidclub-digest blockquote::before');
    expect(styles).not.toContain('.bidclub-digest ul::before');
    expect(styles).not.toContain('.bidclub-digest ol::before');
    expect(styles).not.toContain('.bidclub-digest li::before');
    expect(styles).toContain('content: "-";');
    expect(styles).toContain("position: absolute;");
    expect(styles).toContain("top: 0;");
    expect(styles).toContain("left: 0;");
    expect(styles).toContain("width: 0.9em;");
    expect(styles).toContain("padding-inline-start: 1.2em;");
    expect(styles).toContain("text-align: center;");
    expect(styles).toContain("color: var(--color-slate-400);");
    expect(styles).toContain(".bidclub-digest li::marker");
    expect(styles).toContain("margin: 0 0 1.8em;");
    expect(styles).toContain("line-height: inherit;");
    expect(styles).toContain(".bidclub-digest li > p::before");
    expect(styles).toContain("content: none;");
  });

  it("keeps the mobile surface bounded without reintroducing typography overrides", () => {
    expect(styles).toContain("min-width: 0;");
    expect(bidClubMobileRule).toContain("max-width: 100%;");
    expect(bidClubMobileRule).toContain("overflow-wrap: anywhere;");
    expect(bidClubMobileRule).not.toContain("font-size:");
    expect(bidClubMobileRule).not.toContain("line-height:");
  });
});
