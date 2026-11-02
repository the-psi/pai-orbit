# Gotchas

General rules learned from real scan failures. Each one is a way a scan silently produces a
WRONG answer — usually a falsely clean one.

## 1. Quote every glob argument (zsh)
```bash
grep -r --include=*.ext "pat" .      # FAILS: "zsh: no matches found: --include=*.ext"
grep -r --include="*.ext" "pat" .    # correct
```
zsh expands the glob before the tool sees it and aborts when nothing matches the CWD.
Quote every `*` meant for the tool rather than the shell: `--include`, `--exclude`,
`--exclude-dir`, `find -name`, and glob arguments to any scanner.

## 2. Verify an endpoint actually carries the field before trusting its absence
A registry/API endpoint can return `200 OK` with complete-looking data while **silently
omitting** the field you are testing for — producing a confident false negative.
Before concluding "no package is deprecated / no advisory exists / no field is set",
confirm on a record you KNOW has that field that the endpoint returns it.
Registries commonly split this across endpoint versions: metadata, deprecation state,
yank/unlisted flags and advisory data may each live on a different path or API version, and
the older path returns success while omitting the newer fields entirely.
(Concrete instance: NuGet's `registration5-semver1` omits `deprecation` outright — only
`registration5-gz-semver2` carries it. Assume every registry has an equivalent trap.)

## 3. The toolchain must be able to build/restore the project, or transitives go unscanned
Native audit tools (`dotnet list package --vulnerable`, `govulncheck`, `mvn dependency-check`,
`pip-audit`, `cargo audit`) resolve the dependency graph first. If the installed SDK/runtime
is older than the project's target version, restore fails, the command errors out, and
**transitive dependencies are never examined**. The run looks like a tooling hiccup and gets
reported as "no findings".
Detect in Phase 0: compare the installed toolchain version against the version the project
targets (target framework, `go` directive, `requires-python`, `rust-version`, toolchain files).
On mismatch, fall back to lockfile parsing + OSV, and state the gap explicitly.

## 4. Sanity-check the scanner against known-bad input before trusting a clean result
A broken query and a genuinely clean project return the same thing: nothing.
Before reporting zero findings, run a positive control — query a package/version pair you have
independently confirmed carries an advisory (an old major release of a widely used library) and
confirm the hit comes back. Do this per ecosystem and per tool. Record in the report that the
control passed; that is what makes a clean result credible.

## 5. Regex sweeps are overwhelmingly noise — filter, then hand-verify
A raw entropy/pattern sweep over a real repo returns hits by the thousand and survives triage
at well under 1%. Dominant noise sources, all of which must be excluded:
- **Vector graphics** — `*.svg` and inline `<path d="…">` float coordinate runs match
  long-numeric-ID patterns (cloud account IDs, card numbers) constantly.
- **Lockfile integrity hashes** — `sha512-…` base64 blobs match generic high-entropy rules.
- **Minified bundles, sourcemaps, vendored assets** — `*.min.*`, `dist/`, `build/`, `*.map`.
- **Dependency and build output directories** — `node_modules/`, `vendor/`, `target/`,
  `bin/`, `obj/`, `.venv/`, `.next/`, base64-embedded images and fonts.
- **Test/sample/placeholder values** — `changeme`, `YOUR_KEY_HERE`, `xxxx`, documented examples.
Then hand-verify every survivor. Report the raw-hits → triaged-findings funnel with the
reduction reasons, so the reader can see the filtering was deliberate rather than accidental.

## 6. An override/pin block can itself introduce the vulnerability
`overrides` / `resolutions` / central version-pin files / constraints files are audit targets in
their own right. A block added to force a transitive to a "safe" version can pin it to a version
*inside* the vulnerable range, and a scan that only reads declared dependencies will miss it.
Audit the pin block itself, and re-check it every run — a pin that was safe when written drifts
into an advisory range as new CVEs land.

## 7. Check whether the fix is REACHABLE before recommending a bump
A vulnerable transitive with an available fix is not automatically fixable. If a parent package
constrains it with a narrow pin, the fixed version may be unreachable without violating the
parent's constraint or breaking it. Walk the dependency path from the vulnerable package up to
the declared dependency and determine which applies:
- **Reachable** — a direct bump or an override resolves it. Remediation: bump, low effort.
- **Unreachable** — a parent's pin blocks it. Remediation is *structural*: upgrade, replace or
  migrate off the parent, or accept with a compensating control. Different effort, different
  owner, often different severity.
Reporting an unreachable fix as "bump it" sends someone on an impossible errand and costs the
report its credibility.

## 8. Old ≠ vulnerable — two separate axes, two separate sections
- **Advisory risk**: a published CVE/GHSA affects the installed version.
- **Maintenance risk**: outdated, EOL, deprecated, yanked, unmaintained, archived upstream.
A package can be many years old with zero advisories (maintenance risk only) or fully current
with several HIGH CVEs. Conflating them inflates the first number and buries the second.

## 9. Redact every secret, in every output, including scratch files
- Generic: first 4 + last 2 characters only — `AKIA…7Q`.
- JWTs: report **decoded claims** (`iss`, `aud`, `sub`, `exp`, scopes) — never the token.
- Account/tenant/subscription identifiers: `1234…89`.
- Connection strings: keep host and database, redact user and password entirely.
- Private keys: report type, path and line only — never any key material.
Intermediate scratch files get read back during consolidation, so redact on write, not at the end.

## 10. No version history = no history scan; rotation, not deletion, is the fix
An extracted archive or exported tree has no `.git`, so nothing can be said about what was
committed and later removed. A secret deleted in a later commit is still live in history and
still compromised. State the limitation explicitly, and recommend a history scan against the
real origin repository, e.g.:
```bash
gitleaks detect --source . --log-opts="--all"
trufflehog git file://. --since-commit HEAD~1000
```
Always state the actual remediation: **rotate the credential.** Deleting the line does nothing.

## 11. Build-time public env vars are shipped to every client
Any framework prefix that marks a variable as client-exposed is inlined into the published
bundle at build time: `REACT_APP_*`, `NEXT_PUBLIC_*`, `VITE_*`, `PUBLIC_*`, `GATSBY_*`,
`EXPO_PUBLIC_*`, `NUXT_PUBLIC_*`, and equivalents in any other framework.
A pipeline can mask these perfectly in its logs and still publish them to every visitor.
Flag any such variable holding an API key, secret, token, signing key or account identifier —
regardless of how well the pipeline handles it. Masking in CI is not a control here.

## 12. Committed security-assessment evidence is itself a secrets risk
Prior scan output, pentest reports, HAR files, proxy exports, debug dumps, screenshots and
"findings" documents routinely contain **captured live tokens, session cookies and credentials**.
Search for `*pentest*`, `*security*report*`, `*assessment*`, `*audit*.json`, `*.har`,
`evidence/`, `screenshots/`, `*.dump`, `*.log` fixtures. Treat hits as high-priority findings.

## 13. Multiple lockfiles for one ecosystem = drift risk
Two lockfiles for the same manifest means the installed tree depends on which tool ran, and your
audit describes only one of them. Flag it, and state which lockfile you scanned.

## 14. Report what PASSED, not only what failed
A findings-only report gives the reader no way to tell a thorough scan from a shallow one, and
no credit for controls that are already correct. Explicitly list the checks performed that came
back clean, alongside the coverage limitations that bound them.

## 15. A user-supplied `credentials` file at the project root is scan input, not a finding
Gotcha #15 says to confirm the live target and authorization "from the repo's own config" — a file
literally named `credentials` (no extension) sitting at the project root is that config, when the
user has told you they created it themselves specifically so this skill can pick a target URL and
login for `DISCOVERY`/`ACTIVE-VALIDATION`/a full-coverage DAST script (see
`active-dast-methodology.md`). It is not part of the application's source or its deployed code —
it never ships, it's not read by the app itself, it's a convention between the user and this skill.
Two things follow from that:
- **Read it early, in Phase 0**, specifically to seed the live-target host, username and password
  for every live-testing dimension in scope — don't wait for `DISCOVERY` to go looking for a target
  by other means when this file already states one.
- **Exclude it from SWEEP's (and every other agent's) secrets/hardcoded-credentials findings.** A
  plaintext URL+username+password in a file named exactly `credentials` at the repo root is this
  convention working as intended, not a committed-secret finding — do not write it up as one. This
  applies to that specific, exact filename at the project root only; a similarly-shaped file found
  anywhere else (a subfolder, a config directory, a different name) gets no such exemption and is
  scanned normally — the exemption is for the one deliberate hand-off point, not a blanket pass on
  anything credential-shaped.
- If you're not sure whether a `credentials`-named file is this convention or a genuine leak (e.g.
  the user hasn't mentioned creating one, or it lives somewhere other than the project root), ask
  rather than assume either way — silently excluding a real leak is as wrong as flagging the user's
  own scan-input as a vulnerability.

## 16. When a live check contradicts a static finding, say so explicitly — don't just fix the number
A passive or active live check will sometimes refute or soften something the static pass reported
(a static "no WAF present" finding meeting a live `x-cdn: Imperva` header; a static "no HSTS"
claim meeting a live response that has it). When this happens:
- State the correction explicitly and where it came from — "LIVE correction: the edge is fronted
  by an Imperva WAF (confirmed via response headers); the static finding is downgraded from 'no
  WAF' to 'no AWS-native WAF and no access logging'." Silently editing the finding away, or
  silently leaving the stale static claim next to a contradicting live result, both cost the
  report its credibility.
- The reverse also happens — a live check can confirm and sharpen a static finding (e.g. a
  static "hardcoded key in the client bundle" finding confirmed by grepping the actual served
  bundle for the key material). State that too, tagged LIVE-VALIDATED / CONFIRMED-live.
- Never let an unresolved contradiction sit in the same report as two different verdicts on the
  same control — one of them is wrong, and the reader has no way to tell which without redoing
  the work.

## 17. "What was checked and PASSED" vs "verified-safe / refuted" are different sections
A control that is correctly configured (parameterized queries throughout, secrets loaded from a
secret manager, a fallback-deny authorization policy) belongs in "what passed." A *specific attack
hypothesis* that was investigated and disproven with reasoning (e.g. "RS256→HS256 confusion:
refuted — only a `SymmetricSecurityKey` is ever configured, so there is no RSA key material for an
attacker to redirect an HS256 forgery against"; "XXE: not exploitable — this runtime prohibits DTD
resolution by default") belongs in "verified-safe / refuted." Conflating the two loses the
sharpest kind of negative evidence: proof that a plausible-looking vector was chased down and
closed, not merely that nobody happened to look for it.

## 18. Authorized test-data creation during live validation is a narrow, separate exception
Every live-testing dimension's DEFAULT posture is to create nothing — ACTIVE-VALIDATION's safe
patterns, the full-coverage DAST script, and DISCOVERY's click-through are all read-only/
non-mutating by default (gotcha #15's authorization-verification rule governs whether to test
live at all; this gotcha governs the separate, narrower question of ever writing anything).
Creating even minimal, disposable test data is permitted ONLY when ALL of the following hold:
- The target has already passed gotcha #15's check (host + authorization verified from the
  repo's own config or the user's explicit instruction naming it as their own environment).
- The user has EXPLICITLY authorized test-data creation for this engagement — never infer this
  from "destructive testing seems implied" or from a prior pass having done it; silence is not
  authorization, and authorization from a previous engagement/session does not carry forward.
- The write is minimal and non-bulk — one record, not a loop — and uses an account the
  assessor/user already owns or controls, never a real third party's.
- The created record is clearly tagged as scan output (a recognizable prefix/marker in whatever
  free-text field is available, e.g. `ZZTEST-` or an equivalent project convention) so it can be
  found and removed later, and, wherever practical, the write is reverted immediately after the
  proof is captured and the revert is itself verified.
Whenever this exception is used, the report's **test-data disclosure** list (`report-format.md`
§14) is mandatory, not optional: record type, id/identifiable name prefix, which test account
created it, and which part of the app it lives in — so the target's owner can find and clean it
up even if a revert was also performed. Absent explicit authorization, treat `ClientNBR=="ALL"`-
style ambiguity the same as everywhere else in this skill: decline and fall back to source-only
confirmation, the same as gotcha #15's own instruction for an unverifiable target.
