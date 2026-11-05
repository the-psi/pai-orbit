# Report Rendering

`report-format.md` specifies WHAT a report contains. This file specifies HOW to render that
content as a polished, shareable HTML file and PDF. Read this only once you're producing a
rendered deliverable, not a plain markdown/text answer.

## When to produce a rendered HTML/PDF report

Produce the full HTML+PDF pipeline when any of these hold:
- The user explicitly asks for a "report," "PDF," "document," or a shareable deliverable.
- This is a comprehensive/deep-dive review — the same trigger condition `report-format.md` uses
  for its extended sections (extended tier spawned, the user asked for a "thorough"/"complete"
  assessment, or ≥15 confirmed findings).
- There's an existing project convention for it — a prior `report.html`/`report.pdf` already in
  the repo, or a `security-assessment/` folder pattern already present.

For a narrow single-dimension answer ("any CVEs?", "any hardcoded secrets?"), a plain findings
list is sufficient — don't over-produce a rendered report nobody asked for.

## File layout convention

These are project deliverables, so they land in the target project itself, not the scratchpad:

```
security-assessment/
  FINDINGS.md        # markdown source of truth — structured per report-format.md
  report.html        # rendered version of FINDINGS.md
  report.pdf         # printed from report.html
  evidence/          # raw scan data, organized by dimension — see redaction note below
  scripts/           # reusable scan/discovery scripts
  SBOM.md            # (if produced) dependency bill of materials
  sbom.cdx.json      # (if produced) machine-readable SBOM, CycloneDX
  AUDIT.md           # (if produced) structural self-audit of the assessment itself
```

**`FINDINGS.md` is the single source of truth.** `report.html`/`report.pdf` are rendered FROM it.
Any correction happens in `FINDINGS.md` first, then the HTML/PDF are regenerated — never edited
independently. Editing the HTML directly is exactly how the two drift apart across passes.

The SBOM, when produced, is cross-referenced from `report.html` (per `report-format.md`'s
dependency section) rather than duplicated inline — the report shows the vulnerable subset, the
SBOM file is the full inventory.

**Redaction is a write-time guarantee, not a promotion-time filter.** Per gotcha #9, every agent
redacts on write — scratchpad data is never in an unredacted state to begin with, because it gets
read back during Phase 2 consolidation. Copying/moving that same data into `evidence/` for the
final deliverable does not get a second chance to catch what should already be clean: if anything
unredacted reaches `evidence/`, gotcha #9 was violated upstream and that is itself a defect to fix
at the source agent, not something this folder's own naming is relied on to filter. Before
publishing, do one explicit grep of `evidence/` for raw-looking secrets (long high-entropy runs,
`-----BEGIN`, bare JWTs) as a final confirmation that the write-time rule actually held — treat
any hit as a stop-the-release bug, not a thing to quietly scrub and move on from.

## The HTML design system

A single self-contained HTML file: inline CSS only, no external font/script/stylesheet
dependencies, so it renders correctly offline and prints cleanly.

Default CSS custom-property palette — a brand-neutral, high-contrast enterprise-report look.
Teams can swap the actual color values for their own brand, but should keep this same variable
*scheme* so the rest of this guidance stays valid:

```css
:root{
  --bg:#eceff4; --card:#ffffff; --ink:#141a24; --muted:#586274; --line:#e0e5ec;
  --crit:#8e0038; --high:#c62828; --med:#b26a00; --low:#2e7d32; --info:#1565c0;
  --chip:#eef1f6; --accent:#0b47c2; --code:#0f172a; --codebg:#f4f6fa;
  --ok:#2e7d32; --gaugebg:#e6eaf0; --band:#8e0038; --headbg:#0f1b31; --headink:#eaf0fb;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#0b0e13; --card:#141a21; --ink:#e6edf3; --muted:#9aa4b2; --line:#232a34;
    --crit:#ff5c93; --high:#ff6b6b; --med:#e0a24a; --low:#6cc46c; --info:#5aa9ff;
    --chip:#1b222c; --accent:#6ea8ff; --code:#e6edf3; --codebg:#0d1117; --gaugebg:#232a34;
    --headbg:#0a1120; --headink:#eaf0fb;
  }
}
:root[data-theme="dark"]{
  --bg:#0b0e13; --card:#141a21; --ink:#e6edf3; --muted:#9aa4b2; --line:#232a34;
  --crit:#ff5c93; --high:#ff6b6b; --med:#e0a24a; --low:#6cc46c; --info:#5aa9ff;
  --chip:#1b222c; --accent:#6ea8ff; --code:#e6edf3; --codebg:#0d1117; --gaugebg:#232a34;
  --headbg:#0a1120; --headink:#eaf0fb;
}
```

Both the `@media (prefers-color-scheme: dark)` block AND the explicit `:root[data-theme="dark"]`
block are required, not redundant. The media query alone only responds to OS-level preference —
it misses a page or environment that force-sets `data-theme="dark"` independently of OS
preference (e.g. a viewer or wrapper app that applies the attribute regardless of system theme).
A structural self-audit this session found exactly this gap: a report styled with only the media
query rendered in light colors on an ink-dark-forced environment, unreadable against a dark
surrounding chrome. Ship both blocks.

## Structural elements

Each element below maps to the `report-format.md` content section it renders — this file is "how
to render," that file is "what to include."

- **Confidentiality banner** — full-width, bold, uppercase, colored per classification; repeated
  identically at the very top and the very bottom of the page. Renders the distribution/handling
  statement from the Appendix's "report handling & distribution" paragraph.
- **Cover block** — dark block using `--headbg`/`--headink`: uppercase eyebrow label, H1 title,
  a one-paragraph lede, and a responsive meta-grid of key/value pairs (prepared-by, target,
  environment, date, report reference, classification, standards, rules-of-engagement). Draws
  from the Executive Summary and Scope & Method sections.
- **Overall-exposure callout** — directly under the cover, colored by real severity. Grounded in
  the actual confidence score / grade from the Confidence Scores section — never inflate this to
  look more dramatic than the underlying data supports, and never downplay it either.
- **Table of contents** — two-column box (collapsing to one column under ~620px) linking every
  major section by anchor, in the same order as `report-format.md`'s Required report sections.
- **Stat-card grid** — "assessment by the numbers" summaries: responsive
  `repeat(auto-fit,minmax(118px,1fr))` grid, bold number over a small uppercase label. Used for
  the Executive Summary counts and the dependency section's stat cards.
- **Severity bar chart** — alongside (not instead of) the findings-summary table, a simple
  horizontal bar per severity (Critical/High/Medium/Low), each bar's width proportional to its
  count, colored via `--crit/--high/--med/--low`. Gives an at-a-glance shape to the finding
  distribution before the reader gets to the table itself.
- **Severity badges** — pill-shaped, bold, uppercase, colored per `--crit/--high/--med/--low/--info`.
  Plus a distinct `LIVE-VALIDATED` pill in `--ok` green for live-confirmed findings, and a lighter
  chip style for `CONFIRMED-in-code`/`NEEDS-DYNAMIC` status tags (extended-tier findings).
- **Finding cards** — border-left in the severity color; header row (ID + title + severity/LIVE
  badges); tag row (OWASP category, CWE, confidence score, attacker-effort rating); then labeled
  field blocks in this order: LOCATION (monospace, small, light background), DESCRIPTION/EVIDENCE
  (code-styled block for any snippet), BUSINESS IMPACT, FIX/RECOMMENDATION. **Every field is
  mandatory on every card — never render an empty/blank field block.** If `report-format.md`'s
  per-finding data is missing a field (e.g. no Business Impact was ever written), that's a content
  gap to fix in `FINDINGS.md` first, not something to silently skip when rendering.
  Style each label as a small uppercase tick-marked heading (a short colored accent bar or `::before`
  tick in the card's severity color, e.g. `▍IMPACT`) rather than a plain bold word — this is the
  advisory-card look (as in a professional pentest-tooling report) that reads as more polished than
  a flat label, at zero cost to the mandatory-field rule above (still four fields, just styled).
- **Request/response evidence panels** — anywhere a live request/response pair is quoted (a
  finding's Evidence field, the Appendix request log, the full endpoint evidence log below), render
  each side as its own bordered, monospace, lightly-shaded panel (a subtle background tint distinct
  from the page background, `--codebg`), with a small uppercase tab label directly above it
  ("REQUEST" / "RESPONSE" / "OWN ID" / "ADJACENT ID" as fits the context) — never just a bare `<pre>`
  block with no label, and never a bare byte-count line standing in for one (see `report-format.md`'s
  rule against byte-count comparisons — this is its rendering side).
- **Full DAST endpoint evidence log** (when `active-dast-methodology.md`'s comprehensive pattern
  produced one) — this can run to hundreds of entries, so render it as collapsible `<details>`
  elements (one per endpoint), grouped under a `<h4>`/bold heading per controller/module, collapsed
  by default for on-screen browsing. The `<summary>` line states the endpoint + method + a short
  plain-language verdict (never a byte count) — e.g. "Auth NOT enforced", "adjacent id returns real
  data", "excluded — state-mutating". Color-code each entry by outcome so real issues are visually
  distinct from clean passes at a glance: a colored left border (and/or a small leading dot) —
  red/orange for a real finding (auth not enforced, adjacent id returned non-rejected real data),
  green for a clean pass (auth enforced, adjacent id correctly blocked), grey for excluded or
  inconclusive (no signal either way). This is the single most useful visual cue in a report this
  size — a reader should never have to open every entry to find the ones that matter.
  **Critical PDF-rendering step, easy to miss:** `<details>` renders collapsed by default, and a
  headless-browser PDF print of a collapsed `<details>` omits its content entirely — before calling
  `page.pdf()`, force every one open: `await page.evaluate(() => document.querySelectorAll('details')
  .forEach(d => d.open = true))`. Skipping this silently produces a PDF where the entire evidence log
  reads as a wall of one-line summaries with no evidence inside — verify by checking that the PDF's
  extracted text actually contains the expected JSON/request content, not just the summary lines.
- **Tables** — findings summary, OWASP map, confidence-score domains, attack-surface, threat-actor,
  exposure-rating, remediation quick-wins, retest-verification, appendix logs: all share one
  visual style — header row in a light tint, 1px bordered body rows, monospace font for
  code-like cell content (IDs, file paths, CWE numbers).
- **Confidence-score section** — a large score number next to a grade-letter pill, a horizontal
  gauge bar, and a per-domain mini-table each with its own inline progress bar. Renders
  `report-format.md`'s weighted per-domain-mean formula and its table (Domain | Coverage |
  Findings | Score | Note) — print the formula on the page too, so the number stays auditable.
- **Body typography** — system UI font stack
  (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`),
  ~15px/1.62 line-height; max content width ~1080px centered with ~20px side padding; no
  horizontal scroll at phone width.

## PDF rendering mechanics

1. Check for an available headless-browser tool before starting anything new. Playwright is
   commonly already present under a project's or a global `node_modules/playwright` — check
   there first rather than assuming a fresh install is needed.
2. If truly absent, a fresh `npm install playwright` in your own scratchpad is fine, and
   `npx playwright install chromium` if the browser binary itself is missing.
3. Render:
   - Open the finished `report.html` via a local `file://` URL.
   - `page.emulateMedia({media:'print'})`
   - `page.pdf({format:'A4', printBackground:true, margin:{top:'16mm',bottom:'16mm',left:'15mm',right:'15mm'}})`
4. If no headless-browser capability is available at all after a bounded attempt (a few minutes,
   not longer), say so plainly and deliver the HTML only. Never fabricate or leave behind an
   empty/placeholder PDF file.

## Verification, always

After producing `report.pdf`, confirm it is non-trivial:
- **File size** should scale with content volume — a report with dozens of findings should be
  several hundred KB to a few MB, not a few KB.
- **Page count** should be plausible for the amount of content rendered — extract it via a
  `/Type /Page` object-count grep on the raw PDF bytes, or a PDF-reading library/CLI tool if
  available.

A silently-empty or 1-page PDF for a large report is a rendering failure, not a success —
investigate and re-render rather than reporting it as done.

## Regeneration discipline

Whenever `FINDINGS.md` changes after `report.html`/`report.pdf` already exist, both derived files
MUST be regenerated from the updated source before the task is considered complete. Never leave
`report.html`/`report.pdf` stale relative to `FINDINGS.md` — this drift is exactly the failure
mode across multiple editing passes: a correction lands in the markdown, and the rendered
deliverable someone actually reads or prints still shows the old version.
