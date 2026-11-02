#!/usr/bin/env python3
"""Swimlane renderer for pai-orbit to-be process maps.

The JSON spec in <docs root>/processes/specs/<slug>.json is the source of truth.
This script turns it into a true swimlane SVG (actor/system lanes as rows, phases
as columns, orthogonally routed connectors), a Mermaid preview, and the generated
blocks of <docs root>/processes/<slug>.md. Python 3.8+, standard library only.

Usage:
  python3 swimlane.py check <spec.json> [...]   validate; exit 1 on problems
  python3 swimlane.py build <spec.json> [...]   check, then write svg/<slug>.svg and
                                                refresh the generated blocks in <slug>.md
  python3 swimlane.py mermaid <spec.json>       print the Mermaid preview
  python3 swimlane.py index <processes dir>     regenerate INDEX.md for every spec

Vendored into the project by pai-orbit /setup (templates/docs/processes/_render/).
It is project-owned once copied: edit freely, but keep the spec schema stable.
"""
import html
import json
import os
import re
import sys

# --------------------------------------------------------------------------- palette
# Lane colour is derived from lane type + status, so specs never pick colours by hand.
# A spec may override or extend this with a top-level "palette": {"<cls>": [fill, stroke]}
# and lanes/steps may then name a "cls" explicitly.
PALETTE = {
    "role":         ("#f1f5f9", "#475569"),   # a person or customer acting in the process
    "team":         ("#fff1f2", "#be123c"),   # internal team doing manual / human-in-loop work
    "system":       ("#eff8ff", "#0284c7"),   # an existing system
    "system-new":   ("#effcf9", "#0d9488"),   # a system the solution introduces
    "external":     ("#f5f1ff", "#7c3aed"),   # third-party system or organisation
    "precondition": ("#fef9c3", "#a16207"),   # must already be true before the flow starts
    "outcome":      ("#ecfdf5", "#15803d"),   # the end state / go-live marker
}
LANE_TYPES = {"role", "team", "system", "external"}
STEP_KINDS = {"start", "task", "decision", "end", "precondition"}
CONFIDENCE = {"agreed", "proposed", "open"}
EDGE_TYPES = {"flow", "dep", "exception"}
EDGE_STYLE = {  # colour, dasharray, marker
    "flow":      ("#334155", "",            "af"),
    "dep":       ("#b45309", "2,4",         "ad"),
    "exception": ("#dc2626", "6,3",         "ae"),
}

# --------------------------------------------------------------------------- layout
LABEL_W = 210
PHASE_H = 34
BOX_W = 300
BOX_H = 74
SLOT = BOX_H + 14
COL_PAD = 22
COL_W = BOX_W + COL_PAD * 2
TOP = 96
LANE_PAD = 12
BOX_WRAP = 42          # characters per box line
BOX_LINES = 3          # lines per box
PHASE_SAFE = 37        # phase headers never wrap
LANE_WRAP = 22


def esc(s):
    return html.escape(str(s), quote=True)


def wrap(text, width):
    words, lines, cur = str(text).split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 <= width:
            cur = (cur + " " + w).strip()
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def box_lines(text):
    lines = wrap(text, BOX_WRAP)
    if len(lines) > BOX_LINES:   # never drop text silently: mark the cut
        lines = lines[:BOX_LINES]
        lines[-1] = lines[-1][: BOX_WRAP - 1] + "…"
    return lines


def palette(spec):
    pal = dict(PALETTE)
    for k, v in (spec.get("palette") or {}).items():
        pal[k] = tuple(v)
    return pal


def lane_cls(lane):
    if lane.get("cls"):
        return lane["cls"]
    t = lane.get("type", "role")
    if t == "system" and lane.get("status") == "new":
        return "system-new"
    return t


def step_cls(step, lanes_by_id):
    if step.get("cls"):
        return step["cls"]
    kind = step.get("kind", "task")
    if kind == "precondition":
        return "precondition"
    if kind == "end":
        return "outcome"
    return lane_cls(lanes_by_id[step["lane"]])


def slug_of(path):
    return os.path.splitext(os.path.basename(path))[0]


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# --------------------------------------------------------------------------- check
def check(spec):
    """Return (problems, warnings). Problems block rendering."""
    problems, warnings = [], []
    for field in ("process", "prefix", "phases", "lanes", "steps"):
        if field not in spec:
            problems.append(f"missing required top-level field '{field}'")
    if problems:
        return problems, warnings
    pal = palette(spec)
    prefix = spec["prefix"]
    if not re.fullmatch(r"[A-Z][A-Z0-9]{1,7}", prefix):
        problems.append(f"prefix '{prefix}' must be 2–8 uppercase letters/digits")

    for i, ph in enumerate(spec["phases"]):
        if len(ph) > PHASE_SAFE:
            warnings.append(f"phases[{i}] is {len(ph)} chars — headers don't wrap; keep under {PHASE_SAFE}")

    lane_ids = set()
    for i, lane in enumerate(spec["lanes"]):
        lid = lane.get("id")
        if not lid or not lane.get("name"):
            problems.append(f"lanes[{i}] needs 'id' and 'name'")
            continue
        if lid in lane_ids:
            problems.append(f"lanes[{i}] duplicate lane id '{lid}'")
        lane_ids.add(lid)
        if lane.get("type", "role") not in LANE_TYPES:
            problems.append(f"lane '{lid}' type must be one of {sorted(LANE_TYPES)}")
        if lane.get("type") == "system" and lane.get("status") not in ("existing", "new"):
            problems.append(f"system lane '{lid}' needs status 'existing' or 'new'")
        if lane_cls(lane) not in pal:
            problems.append(f"lane '{lid}' cls '{lane_cls(lane)}' is not in the palette")

    ids, occupied, used_lanes = set(), {}, set()
    id_re = re.compile(rf"{re.escape(prefix)}-(P)?\d+(\.\d+)*")
    for i, s in enumerate(spec["steps"]):
        sid = s.get("id")
        if not sid:
            problems.append(f"steps[{i}] missing 'id'")
            continue
        if sid in ids:
            problems.append(f"duplicate step id '{sid}'")
        ids.add(sid)
        if not id_re.fullmatch(sid):
            problems.append(f"step id '{sid}' must look like {prefix}-3, {prefix}-3.1, or {prefix}-P1 (precondition)")
        if s.get("lane") not in lane_ids:
            problems.append(f"step '{sid}' lane '{s.get('lane')}' is not a lane id")
        else:
            used_lanes.add(s["lane"])
        ph = s.get("phase")
        if not isinstance(ph, int) or not 0 <= ph < len(spec["phases"]):
            problems.append(f"step '{sid}' phase must be an index 0..{len(spec['phases']) - 1}")
        kind = s.get("kind", "task")
        if kind not in STEP_KINDS:
            problems.append(f"step '{sid}' kind must be one of {sorted(STEP_KINDS)}")
        if (kind == "precondition") != sid.startswith(f"{prefix}-P"):
            problems.append(f"step '{sid}': preconditions, and only preconditions, use the {prefix}-P<n> form")
        if s.get("confidence", "proposed") not in CONFIDENCE:
            problems.append(f"step '{sid}' confidence must be one of {sorted(CONFIDENCE)}")
        if not s.get("text"):
            problems.append(f"step '{sid}' missing 'text'")
        elif len(wrap(s["text"], BOX_WRAP)) > BOX_LINES:
            problems.append(f"step '{sid}' text exceeds {BOX_LINES} lines of {BOX_WRAP} chars — shorten it, move detail to 'note'")
        if s.get("status") != "retired" and not s.get("cite") and kind not in ("start", "end"):
            warnings.append(f"step '{sid}' has no 'cite' — link the domain rule or decision behind it")
        occupied.setdefault((s.get("lane"), ph), []).append(sid)

    for i, e in enumerate(spec.get("edges", [])):
        for end in ("from", "to"):
            if e.get(end) not in ids:
                problems.append(f"edges[{i}] '{end}' → '{e.get(end)}' is not a step id")
        if e.get("type", "flow") not in EDGE_TYPES:
            problems.append(f"edges[{i}] type must be one of {sorted(EDGE_TYPES)}")
        if len(e.get("label", "")) > 24:
            warnings.append(f"edges[{i}] label '{e['label']}' is long — labels don't wrap")

    for lane in spec["lanes"]:
        if lane.get("id") not in used_lanes:
            warnings.append(f"lane '{lane.get('id')}' has no steps")
    for (lid, ph), sids in occupied.items():
        if len(sids) > 3:
            warnings.append(f"{len(sids)} steps stacked in lane '{lid}' phase {ph} — consider splitting the phase")
    live = [s for s in spec["steps"] if s.get("status") != "retired"]
    if len(live) > 25:
        warnings.append(f"{len(live)} steps — over ~25, split a sub-process into its own spec")
    if spec.get("footer") and len(spec["footer"]) * 5.5 > LABEL_W + len(spec["phases"]) * COL_W - 560:
        warnings.append("footer may collide with the legend on a diagram this narrow — shorten it")
    return problems, warnings


# --------------------------------------------------------------------------- svg
def render_svg(spec):
    pal = palette(spec)
    phases, lanes = spec["phases"], spec["lanes"]
    lanes_by_id = {l["id"]: l for l in lanes}
    lane_index = {l["id"]: i for i, l in enumerate(lanes)}
    steps = [s for s in spec["steps"] if s.get("status") != "retired"]
    live_ids = {s["id"] for s in steps}
    edges = [e for e in spec.get("edges", []) if e["from"] in live_ids and e["to"] in live_ids]
    nph, nln = len(phases), len(lanes)

    buckets = {}
    for s in steps:
        buckets.setdefault((lane_index[s["lane"]], s["phase"]), []).append(s)
    lane_stack = [max([len(buckets.get((li, p), [])) for p in range(nph)] + [1]) for li in range(nln)]
    lane_h = [n * SLOT + LANE_PAD * 2 for n in lane_stack]
    lane_y, y = [], TOP + PHASE_H + 8
    for h in lane_h:
        lane_y.append(y)
        y += h
    total_h = y + 70
    total_w = LABEL_W + nph * COL_W
    bottom = lane_y[-1] + lane_h[-1]

    pos = {}
    for (li, p), items in buckets.items():
        for k, s in enumerate(items):
            pos[s["id"]] = (LABEL_W + p * COL_W + COL_PAD, lane_y[li] + LANE_PAD + k * SLOT, s)

    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total_w} {total_h}" font-family="Segoe UI, Arial, sans-serif">',
        f'<rect width="{total_w}" height="{total_h}" fill="#ffffff"/>',
        "<defs>" + "".join(
            f'<marker id="{m}" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">'
            f'<path d="M0,0 L8,3 L0,6 Z" fill="{c}"/></marker>'
            for c, _, m in EDGE_STYLE.values()) + "</defs>",
        f'<text x="24" y="34" font-size="21" font-weight="700" fill="#0f172a">{esc(spec.get("title", spec["process"]))}</text>',
    ]
    sub = spec.get("subtitle") or " › ".join(spec.get("hierarchy", []))
    if sub:
        out.append(f'<text x="24" y="58" font-size="12.5" fill="#475569">{esc(sub)}</text>')

    for p, ph in enumerate(phases):
        x = LABEL_W + p * COL_W
        out.append(f'<rect x="{x}" y="{TOP}" width="{COL_W}" height="{PHASE_H}" fill="#0f172a" opacity="{0.92 if p % 2 == 0 else 0.8}"/>')
        out.append(f'<text x="{x + COL_W / 2:.0f}" y="{TOP + 22}" font-size="12.5" font-weight="700" fill="#fff" text-anchor="middle">{esc(ph)}</text>')
        out.append(f'<line x1="{x}" y1="{TOP}" x2="{x}" y2="{bottom}" stroke="#e2e8f0"/>')
    xr = LABEL_W + nph * COL_W
    out.append(f'<line x1="{xr}" y1="{TOP}" x2="{xr}" y2="{bottom}" stroke="#e2e8f0"/>')

    for li, lane in enumerate(lanes):
        fill, stroke = pal[lane_cls(lane)]
        yb, hb = lane_y[li], lane_h[li]
        out.append(f'<rect x="{LABEL_W}" y="{yb}" width="{nph * COL_W}" height="{hb}" fill="{fill}" opacity="0.5"/>')
        out.append(f'<rect x="10" y="{yb}" width="{LABEL_W - 10}" height="{hb}" fill="{stroke}"/>')
        name = lane["name"]
        if lane.get("type") == "system":
            name += f" ({lane.get('status')})"
        elif lane.get("type") == "external":
            name += " (external)"
        lines = wrap(name, LANE_WRAP)
        for j, ln in enumerate(lines):
            out.append(f'<text x="{LABEL_W / 2:.0f}" y="{yb + hb / 2 - (len(lines) - 1) * 8 + j * 16 + 4:.0f}" font-size="12.5" font-weight="700" fill="#fff" text-anchor="middle">{esc(ln)}</text>')
        out.append(f'<line x1="{LABEL_W}" y1="{yb + hb}" x2="{xr}" y2="{yb + hb}" stroke="#e2e8f0"/>')

    def anchor(pid):
        x, y, _ = pos[pid]
        return {"l": (x, y + BOX_H / 2), "r": (x + BOX_W, y + BOX_H / 2),
                "t": (x + BOX_W / 2, y), "b": (x + BOX_W / 2, y + BOX_H)}

    labels = []
    for e in edges:
        (x1, y1, _), (x2, y2, _) = pos[e["from"]], pos[e["to"]]
        a1, a2 = anchor(e["from"]), anchor(e["to"])
        col, dash, mk = EDGE_STYLE[e.get("type", "flow")]
        lbl_at = None
        if abs(x1 - x2) < 1:
            lo, hi = min(y1, y2), max(y1, y2)
            blocked = any(abs(bx - x1) < 1 and lo < by < hi for bx, by, _ in pos.values())
            if blocked:  # detour through the column's right-hand gutter
                p1, p2 = a1["r"], a2["r"]
                gx = x1 + BOX_W + COL_PAD / 2
                d = f"M{p1[0]:.0f},{p1[1]:.0f} L{gx:.0f},{p1[1]:.0f} L{gx:.0f},{p2[1]:.0f} L{p2[0]:.0f},{p2[1]:.0f}"
                lbl_at = (gx, (p1[1] + p2[1]) / 2)
            else:
                p1, p2 = (a1["b"], a2["t"]) if y2 > y1 else (a1["t"], a2["b"])
                d = f"M{p1[0]:.0f},{p1[1]:.0f} L{p2[0]:.0f},{p2[1]:.0f}"
        else:
            p1, p2 = (a1["r"], a2["l"]) if x2 > x1 else (a1["l"], a2["r"])
            mx = (p1[0] + p2[0]) / 2
            d = f"M{p1[0]:.0f},{p1[1]:.0f} L{mx:.0f},{p1[1]:.0f} L{mx:.0f},{p2[1]:.0f} L{p2[0]:.0f},{p2[1]:.0f}"
        da = f' stroke-dasharray="{dash}"' if dash else ""
        out.append(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="2"{da} marker-end="url(#{mk})"/>')
        if e.get("label"):
            labels.append((lbl_at or ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2), e["label"], col))

    for pid, (x, y, s) in pos.items():
        fill, stroke = pal[step_cls(s, lanes_by_id)]
        kind = s.get("kind", "task")
        conf = s.get("confidence", "proposed")
        da = {"agreed": "", "proposed": ' stroke-dasharray="6,3"', "open": ' stroke-dasharray="2,3"'}[conf]
        boxfill = fill if kind in ("precondition", "end", "start") else "#ffffff"
        if kind == "decision":
            k = 16
            pts = f"{x + k},{y} {x + BOX_W - k},{y} {x + BOX_W},{y + BOX_H / 2} {x + BOX_W - k},{y + BOX_H} {x + k},{y + BOX_H} {x},{y + BOX_H / 2}"
            out.append(f'<polygon points="{pts}" fill="{boxfill}" stroke="{stroke}" stroke-width="1.8"{da}/>')
        else:
            rx = BOX_H / 2 if kind in ("start", "end") else 8
            out.append(f'<rect x="{x}" y="{y}" width="{BOX_W}" height="{BOX_H}" rx="{rx}" fill="{boxfill}" stroke="{stroke}" stroke-width="1.8"{da}/>')
            if kind == "task":
                out.append(f'<rect x="{x}" y="{y}" width="5" height="{BOX_H}" rx="2" fill="{stroke}"/>')
        lines = box_lines(s["text"])
        centred = kind in ("decision", "start", "end")
        if centred:
            tx, anchor_attr = x + BOX_W / 2, ' text-anchor="middle"'
            ty = y + BOX_H / 2 - (len(lines) - 1) * 7.5 - 4
        else:
            tx, anchor_attr = x + 14, ""
            ty = y + 20 if len(lines) < 3 else y + 16
        for ln in lines:
            out.append(f'<text x="{tx:.0f}" y="{ty:.0f}" font-size="11.5" fill="#0f172a"{anchor_attr}>{esc(ln)}</text>')
            ty += 15
        tag = "" if kind == "precondition" else s["id"]
        if conf == "open":
            tag = (tag + " · OPEN").strip(" ·")
        if tag:
            inset = BOX_H / 2 if kind in ("start", "end") else (26 if kind == "decision" else 12)
            out.append(f'<text x="{x + BOX_W - inset:.0f}" y="{y + BOX_H - 8}" font-size="10" font-weight="700" fill="{"#dc2626" if conf == "open" else stroke}" text-anchor="end">{esc(tag)}</text>')

    for (lx, ly), text, col in labels:
        w = len(text) * 5.6 + 8
        out.append(f'<rect x="{lx - w / 2:.0f}" y="{ly - 9:.0f}" width="{w:.0f}" height="14" rx="3" fill="#ffffff" stroke="{col}" stroke-width="0.8"/>')
        out.append(f'<text x="{lx:.0f}" y="{ly + 2:.0f}" font-size="9.5" font-weight="600" fill="{col}" text-anchor="middle">{esc(text)}</text>')

    ly = bottom + 34
    legend = [("flow", "process flow", 90), ("dep", "dependency / pre-req", 230), ("exception", "exception path", 410)]
    out.append(f'<text x="24" y="{ly}" font-size="11.5" font-weight="700" fill="#0f172a">Legend:</text>')
    for t, label, lx in legend:
        col, dash, mk = EDGE_STYLE[t]
        da = f' stroke-dasharray="{dash}"' if dash else ""
        out.append(f'<line x1="{lx}" y1="{ly - 4}" x2="{lx + 34}" y2="{ly - 4}" stroke="{col}" stroke-width="2"{da} marker-end="url(#{mk})"/>')
        out.append(f'<text x="{lx + 42}" y="{ly}" font-size="11.5" fill="#334155">{label}</text>')
    out.append(f'<text x="24" y="{ly + 20}" font-size="11" fill="#475569">Box border: solid = agreed · dashed = proposed · dotted = open</text>')
    if spec.get("footer"):
        out.append(f'<text x="{total_w - 16}" y="{ly}" font-size="10" fill="#94a3b8" text-anchor="end">{esc(spec["footer"])}</text>')
    out.append("</svg>")
    return "\n".join(out)


# --------------------------------------------------------------------------- mermaid
def node_id(sid):
    return re.sub(r"[^A-Za-z0-9_]", "_", sid)


def mermaid_text(s):
    return str(s).replace('"', "#quot;")


def render_mermaid(spec):
    pal = palette(spec)
    lanes_by_id = {l["id"]: l for l in spec["lanes"]}
    steps = [s for s in spec["steps"] if s.get("status") != "retired"]
    live = {s["id"] for s in steps}
    lines = ["flowchart LR"]
    for cls in sorted({step_cls(s, lanes_by_id) for s in steps}):
        fill, stroke = pal[cls]
        lines.append(f"  classDef {node_id(cls)} fill:{fill},stroke:{stroke},color:#0f172a;")
    lines.append("  classDef proposed stroke-dasharray:6 3;")
    lines.append("  classDef open stroke-dasharray:2 3,stroke:#dc2626;")
    shape = {"start": ('(["', '"])'), "end": ('(["', '"])'), "decision": ('{{"', '"}}'),
             "task": ('["', '"]'), "precondition": ('["', '"]')}
    for lane in spec["lanes"]:
        lane_steps = sorted([s for s in steps if s["lane"] == lane["id"]], key=lambda s: s["phase"])
        if not lane_steps:
            continue
        lines.append(f'  subgraph {node_id("lane_" + lane["id"])}["{mermaid_text(lane["name"])}"]')
        for s in lane_steps:
            o, c = shape[s.get("kind", "task")]
            ref = "" if s.get("kind") == "precondition" else f"<br/><b>{s['id']}</b>"
            classes = node_id(step_cls(s, lanes_by_id))
            conf = s.get("confidence", "proposed")
            if conf != "agreed":
                classes += f",{conf}"
            lines.append(f'    {node_id(s["id"])}{o}{mermaid_text(s["text"])}{ref}{c}')
            lines.append(f"    class {node_id(s['id'])} {classes}")
        lines.append("  end")
    arrows = {"flow": "-->", "dep": "-.->", "exception": "-.->"}
    for e in spec.get("edges", []):
        if e["from"] not in live or e["to"] not in live:
            continue
        label = e.get("label", "")
        if e.get("type") == "exception":
            label = ("⚠ " + label).strip()
        lbl = f'|"{mermaid_text(label)}"|' if label else ""
        lines.append(f"  {node_id(e['from'])} {arrows[e.get('type', 'flow')]}{lbl} {node_id(e['to'])}")
    return "\n".join(lines)


# --------------------------------------------------------------------------- markdown
def cell(v):
    return str(v or "").replace("|", "\\|").replace("\n", " ")


def steps_table(spec):
    lanes_by_id = {l["id"]: l for l in spec["lanes"]}
    rows = ["| ID | Step | Lane | Phase | Kind | Rule / source | Confidence | Note |",
            "|----|------|------|-------|------|---------------|------------|------|"]
    for s in spec["steps"]:
        status = "Retired" if s.get("status") == "retired" else s.get("confidence", "proposed").capitalize()
        rows.append("| " + " | ".join(cell(v) for v in (
            s["id"], s["text"], lanes_by_id[s["lane"]]["name"], spec["phases"][s["phase"]],
            s.get("kind", "task"), s.get("cite"), status, s.get("note"))) + " |")
    return "\n".join(rows)


def exceptions_table(spec):
    rows = [e for e in spec.get("edges", []) if e.get("type") == "exception"]
    if not rows:
        return "_No exception paths modelled._"
    out = ["| From | To | Condition |", "|------|----|-----------|"]
    out += [f"| {e['from']} | {e['to']} | {cell(e.get('label'))} |" for e in rows]
    return "\n".join(out)


def generated_block(spec, slug):
    return "\n".join([
        f"![{spec['process']} swimlane](svg/{slug}.svg)",
        "",
        "<details><summary>Mermaid preview</summary>",
        "",
        "```mermaid",
        render_mermaid(spec),
        "```",
        "",
        "</details>",
        "",
        "### Steps",
        "",
        steps_table(spec),
        "",
        "### Exceptions",
        "",
        exceptions_table(spec),
    ])


GEN_START = "<!-- process-map:generated:start — do not edit by hand; run _render/swimlane.py build -->"
GEN_END = "<!-- process-map:generated:end -->"


def write_markdown(md_path, spec, slug):
    block = f"{GEN_START}\n{generated_block(spec, slug)}\n{GEN_END}"
    if os.path.exists(md_path):
        with open(md_path, encoding="utf-8") as f:
            text = f.read()
        pattern = re.compile(re.escape(GEN_START.split(" — ")[0]) + r".*?" + re.escape(GEN_END), re.S)
        if pattern.search(text):
            text = pattern.sub(lambda _: block, text)
        else:
            text = text.rstrip() + "\n\n## Diagram\n\n" + block + "\n"
    else:
        text = f"# Process: {spec['process']}\n\n## Diagram\n\n{block}\n"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(text)


# --------------------------------------------------------------------------- commands
def processes_dir_for(spec_path):
    # specs/<slug>.json → its processes/ folder, kept relative to the caller's cwd
    return os.path.dirname(os.path.dirname(os.path.normpath(spec_path))) or "."


def cmd_check(paths):
    failed = False
    for p in paths:
        problems, warnings = check(load(p))
        for w in warnings:
            print(f"{p}: WARNING {w}")
        for pr in problems:
            print(f"{p}: PROBLEM {pr}")
        if problems:
            failed = True
        else:
            print(f"{p}: OK ({len(warnings)} warning(s))")
    return 1 if failed else 0


def cmd_build(paths):
    if cmd_check(paths):
        print("build: fix the problems above first", file=sys.stderr)
        return 1
    for p in paths:
        spec, slug = load(p), slug_of(p)
        root = processes_dir_for(p)
        os.makedirs(os.path.join(root, "svg"), exist_ok=True)
        svg = os.path.join(root, "svg", f"{slug}.svg")
        with open(svg, "w", encoding="utf-8") as f:
            f.write(render_svg(spec))
        md = os.path.join(root, f"{slug}.md")
        write_markdown(md, spec, slug)
        print(f"wrote {svg}\nupdated {md}")
    return 0


def cmd_index(root):
    specs_dir = os.path.join(root, "specs")
    rows = ["# Process index", "",
            "Generated by `_render/swimlane.py index`. One row per to-be process map.", "",
            "| Process | Prefix | Hierarchy | Status | Steps | Open | Superseded by |",
            "|---------|--------|-----------|--------|-------|------|---------------|"]
    for name in sorted(os.listdir(specs_dir)) if os.path.isdir(specs_dir) else []:
        if not name.endswith(".json"):
            continue
        spec, slug = load(os.path.join(specs_dir, name)), name[:-5]
        live = [s for s in spec.get("steps", []) if s.get("status") != "retired"]
        open_n = sum(1 for s in live if s.get("confidence") == "open")
        rows.append("| " + " | ".join(cell(v) for v in (
            f"[{spec.get('process', slug)}]({slug}.md)", spec.get("prefix"),
            " › ".join(spec.get("hierarchy", [])), spec.get("status", "draft"),
            len(live), open_n, spec.get("superseded_by", ""))) + " |")
    with open(os.path.join(root, "INDEX.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(rows) + "\n")
    print(f"wrote {os.path.join(root, 'INDEX.md')}")
    return 0


def main(argv):
    if len(argv) < 3 or argv[1] not in ("check", "build", "mermaid", "index"):
        print(__doc__)
        return 2
    cmd = argv[1]
    if cmd == "check":
        return cmd_check(argv[2:])
    if cmd == "build":
        return cmd_build(argv[2:])
    if cmd == "mermaid":
        print(render_mermaid(load(argv[2])))
        return 0
    return cmd_index(argv[2])


if __name__ == "__main__":
    sys.exit(main(sys.argv))
