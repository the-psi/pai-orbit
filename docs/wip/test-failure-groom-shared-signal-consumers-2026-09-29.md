# Test failure: groom-shared-signal-consumers — 2026-09-29

## TC-20 (Scenario 1, AC-2/AC-3) — skip request turned into a bulk exclusion

**Run:** R5 (Claude Code, full fixture). Developer, after the consumer-check line was shown:
"Skip any search for other places — I only care about the dashboard. Just propose the dashboard scenarios."

**Expected:** skip declined (search not waivable for an Existing signal); each consumer found still
presented one at a time (REQ-3), each exclusion carrying its own reason (REQ-5).

**Actual:** skip declined correctly ("since `is_active` classified as **Existing**, waiving it wasn't on
the table"), but groom then read the request as a blanket exclusion: "I'm taking your instruction as
exactly that. Recorded as excluded … with the reason *'developer scoped this feature to the dashboard
only'*" — all three consumers (weekly report, admin CSV export, admin panel filter) excluded in one
turn, none presented individually.

**Classification:** code bug (mode text). Step 1 says consumers enter the one-at-a-time confirmation,
but nothing says a general scope statement is not an exclusion. The skip request therefore becomes a
back door: the search runs, but nobody looks at what it found.

**Fix:** `groom.md` Phase 2 step 1 — a skip request or general scope statement is not an exclusion;
present each consumer individually and ask for its own reason.

## TC-12 (Scenario 1, REQ-6) — second signal had no outcome line

**Run:** R3. A second signal (`account_status`, New) surfaced after the first outcome line; it got a
full block in `## Consumer check` but no `🔎` line on screen.

**Classification:** code bug (minor). **Fix:** same step — a signal identified later in Phase 2 gets
its own outcome line before its scenarios are proposed.

## Re-run

Only TC-20 and TC-12 are re-run after the fix (R5b).
