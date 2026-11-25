# Security findings

Use this path only when the goal points to a **security findings file**: a security assessment or pen-test report (any format; its tracker copy is a `.csv`), or a findings tracker (`.xlsx` / `.csv`) whose rows are security findings (a severity column and security categories such as auth, injection or secrets). If it is unclear whether a file is a security findings list (for example a QA bug list, or an accessibility or performance audit), ask the user before taking this path; under "don't ask", use the normal build path instead. A finding pasted in chat, findings from `/review security`, or a feature ticket with a security checklist is fixed the normal way, through the build-readiness gate. Always work on a branch and open a PR for this path, whatever the branching model (never commit findings fixes straight to the main branch). If already on a branch created for this findings work, reuse it; on any other branch (including an unrelated feature branch), create a new branch from the main branch. Under "don't ask", state the branch name and create it without waiting for confirmation. Write all working files to `<docs root>/wip/security-fix-<date>/`. **Never write a secret's value into anything you produce**: docs, working files, the tracker copy, attack tests, fixtures, or finding text copied from the source (redact it in what you produce; never edit the source tracker). Refer to a secret by its config key or name, and give tests their own fake values.

1. **Intake:** run the full test suite once on the unchanged branch and record any tests that already fail in `triage.md` (this baseline is required on this path). Read every row (ID, severity, location, finding, recommended action, existing status). Read `.xlsx` with available tooling; if there is none, ask for a CSV export. Rows already marked in progress elsewhere are not worked unless told otherwise, but are counted and carried through unchanged. If the full suite cannot run here (it needs services you don't have), say so at the checkpoint and run what can run; findings whose tests could not run are `Not proven`. Before triage, confirm the rows you read (worked + carried through) match the number of rows in the source.
2. **Triage against the code:** for each finding, record in `triage.md`: present? (`file:line`), really High/Critical? (with a reason), root-cause group (auth, token, IDOR, business logic, secrets, dependencies, password storage, injection, CI/CD), lane (`code` / `design` / `ops` / `skip`), fix decision with a reason, and the attack (request or input → result expected once fixed). **Lane rules:** `code` is only for a local fix that follows a pattern already in the repo. A fix that changes the auth model, token format, data model or service boundaries, or needs a new pattern, is `design`.
3. **One checkpoint:** show every finding with its lane and whether its fix changes login, access or session / token behaviour, the counts per lane, every skip / downgrade / design / ops decision with its reason, the credential rotations the secrets findings need, and the fix order, then ask the owner once to confirm. If told to proceed without asking, state the plan and continue with the `code` lane only: skips, downgrades and Won't fix stay `Proposed - owner to confirm` and are never applied without the owner's confirmation. A plan that was only stated is not confirmed: it stands in for the confirmed plan below until the owner confirms it in the PR review. On both paths, a `code`-lane fix that changes who can log in, what a user can access, or session / token behaviour is applied but marked `Fixed - owner review required` and listed first in the final summary. The confirmed plan replaces groom and design for `code`-lane findings only; `design`-lane findings go to `/design`.
4. **Fix by group, in order:** secrets → auth → tokens → ownership / IDOR → business logic → injection → password storage → dependencies → CI/CD. Fix a shared root cause once. **Password storage:** leave no existing row on the weak scheme. Reversible encryption: decrypt and re-hash every row. One-way hashes (e.g. unsalted MD5): wrap each old hash in the new KDF now and upgrade it on next login, or force a reset. Rows neither path can handle go to `ops` or `design`. Ship the row conversion as a migration script the owner runs (or a startup step that runs only when a flag the owner sets is on); never run it against a live or shared database yourself. If anything outside this change still reads the old values (another app, portal or job), the migration is `design`, not `code`.
5. **Prove each fix:** for each group the order is attack tests → fix → full suite, with or without the orchestrator. Write one attack test per `code`-lane finding in the group, named with its ID, in its own file (with any helper or fixture it needs; never edit a shared helper file for an attack test) so it can be left out of a commit on its own, and see it fail on its attack assertion against unchanged code; record that failure message in `triage.md`, with any secret value in it redacted. A compile or setup failure, or a failure produced by temporarily changing code, does not count. If an earlier group's fix already blocks the attack, run the test against the branch's base commit (e.g. in a temporary worktree) and record that failure; if you cannot, mark the finding `Not proven`. `Not proven` wins over `Fixed - owner review required`: such a finding stays `Not proven` (still listed under the PR's do-not-merge heading) and never becomes `Fixed - verified`. Then fix; then run the full suite before starting the next group. A failing suite means a test fails that was not in the intake baseline. Before treating a failure as caused by the group, run each newly failing test at least 3 times against the base commit, in a temporary worktree with the same dependencies and services as your test runs. Record it in `triage.md` as pre-existing or flaky, and carry on, only if it also fails on the base commit with the same failure message; a test that fails only after the group's change, even intermittently, is the group's failure. If you cannot run the base commit, treat the failure as the group's (below); do not record it as pre-existing. This applies only to tests that existed at the base commit; an attack test written on this path that fails after its fix or a later group is always a failure of the current group. If the suite still fails, fix the group's own code, or revert the group's fix, keep its attack tests but mark them skipped with the finding ID, and mark its findings `Design required`; never start the next group on a failing suite. Never edit or delete existing tests to make the suite pass. If an existing test asserts the insecure behaviour, leave it, revert as above, and propose the test change as `Proposed - owner to confirm`. Attack tests are required even when told not to ask. Where there is no behaviour to attack (dependencies, CI/CD, secrets in config), a test asserting the fixed version or config counts as the attack test; for a secret, assert it is read from the environment or secret store, never by matching the old value. If the repo has no test harness, add a minimal one when it fits the stack without new architecture; otherwise say so and mark those findings `Not proven` with the reason.
6. **Ops lane:** write `ops-actions.md` (rotate exposed credentials, purge history only with owner approval, review logs). Removing a secret from code never closes its finding: it stays `Ops action required` until the owner confirms the rotation, then becomes `Fixed - pending verification` if it needed no code change or its code fix is in and proven (a `Fixed - owner review required` finding keeps that status); otherwise it keeps its step 5 status.
7. **Write back:** update `triage.md` with each outcome, and write an updated **copy** of the tracker in the working folder as `<original name>-updated-<date>.<ext>` (never overwrite the original). Keep the original's sheets, columns and formatting; fill its own columns by meaning, and add a column only when none fits. For `.xlsx`, copy the file and change only cell values in the copy (e.g. openpyxl `load_workbook` on the copy, then save); never rebuild the workbook from a dataframe, which drops formulas, validation and conditional formatting. openpyxl also drops charts, images and pivot tables (and macros unless `keep_vba=True`) without warning, so before saving check the original file (a zip) for `xl/charts/`, `xl/drawings/`, `xl/pivotTables/` and `vbaProject.bin`, and say if any are there. Redact any secret value the copied cells quote, in the copy and any `.csv`. Before saving, also check the original for `<extLst>` entries (x14 conditional formatting and data validation) and `xl/threadedComments/`, which openpyxl drops silently, and report any. After saving, compare the copy with the original by script: sheet names, column headers, each cell's value outside the columns you filled and the cells you redacted, each cell's formula and number format, merged ranges, defined names, and per sheet the counts of `ws.conditional_formatting` and `ws.data_validations.dataValidation`; tell the owner that openpyxl drops cached formula results, so formula cells show blank until Excel recalculates; if anything was lost, also write a `.csv` with the same columns and report what was lost. Then check the copy has every source row plus the new rows, and search the copy and any `.csv` (including comments and hidden sheets), `triage.md`, `ops-actions.md` and the attack tests, and (before each commit and before opening the PR) the added lines of the staged diff, the commit message and the PR description, for each known secret value; report any difference or match. Do the secret search only with the script under **secret_scan.py** below: save it as `secret_scan.py` in the working folder and run it with each config source and key name, e.g. `python secret_scan.py --source <base>:<config file> --key Jwt:Key <paths>`, and with `--staged` before each commit, always from the code repository's root. Once a value has been removed from the working tree, read it from the base commit (`--source <base>:<file>`); for a value with no key name, use `--pattern`. Write the commit message and the PR description to files in the working folder and scan those too. Exit 2 means the scan did not fully run (a key with no value, a missing path or an error): fix the arguments and run it again; never treat it as clean. If Python 3 is not available, stop and ask the owner; never hand-roll a search that could echo values. The script reads the values itself (from the working tree, a git revision or `--env`), checks literal, base64, URL-encoded, hex and fragment forms, reads every part of `.xlsx` files (hidden sheets, comments), and prints only file, line, key name and form. Never put a secret value in a command, message or log. On a match in the staged diff, commit message or PR description, remove the value and search again before committing or opening the PR. Statuses: `Fixed - verified` (only after step 8), `Fixed - pending verification`, `Fixed - owner review required`, `Ops action required`, `Design required`, `Proposed - owner to confirm`, `Won't fix - <reason>` (owner-confirmed only), `In progress elsewhere`, `Not proven`. Add issues found along the way as new rows.
8. **Verify independently:** recommend `/review security` (or `security-scan-retest` if installed) in a fresh session or by a person; never run it in the same session that made the fixes. Nothing moves past "pending verification" until that passes. `Fixed - owner review required` clears only when the owner approves that fix and the independent review passes; the PR must not merge while any finding still has it. In the PR description, list every finding whose fix changes login, access or session / token behaviour (whatever its status, including `Not proven`), and, if the plan was only stated, one line saying the plan in `triage.md` awaits the owner's confirmation, and the IDs of findings still waiting on a credential rotation, with a pointer to `ops-actions.md` (no key names), under **Do not merge until the owner approves and the independent review passes**, and for each fixed finding give its attack test name and that it failed before the fix. In the PR description, commit messages, board items and anything else committed (including `product-capabilities.md`, ADRs and session captures), every finding whose status does not start with `Fixed -` counts as not fixed, and is named only by ID and status: never say where its weakness or an unrotated secret still is (no file, location or "still in source"); board items for findings that are not fixed give only the ID, status and a pointer to `triage.md`. An attack test for a `Not proven` finding whose fix is in is committed with that fix; only tests for reverted or unapplied fixes are kept out. The working folder is not committed unless the owner says so; give the owner `triage.md` directly. Commit a group only after its suite passes; never commit an attack test before its fix is in. Close the findings board item only after the PR merges and no finding is `Ops action required`; board pointers say `triage.md` is held by the owner. Skipped attack tests for findings that are not fixed are also kept out of the commit unless the owner says otherwise (never commit a file that holds one), and the PR and commit messages give findings that are not fixed only by ID and status, never their attack details. After approval and review, set only the `Fixed - owner review required` and `Fixed - pending verification` findings that passed to `Fixed - verified` in the tracker copy; `Not proven` and `Design required` keep their status (the owner asks `/build` to, or `security-scan-retest` does it if installed).

## secret_scan.py

Python 3 standard library only. Save it unchanged in the working folder (it is not committed).

```python
"""Search files for known secret values without ever printing a value.

Run it from the code repository's root.
Values are read from where they live, by key name only:
  --source PATH          config file in the working tree
  --source REV:PATH      config file at a git revision (use the base commit
                         once a value has been removed from the working tree)
  --key NAME             key to read from every --source, e.g. Jwt:Key,
                         Jwt__Key or Password (repeatable)
  --pattern REGEX        regex whose first group is a value, applied to every
                         --source (for values with no key name) (repeatable)
  --env VAR              environment variable holding a value (repeatable)
Targets: paths (files or folders); --staged (added lines of `git diff --cached`).
Checks the literal value plus base64, URL-encoded and hex forms, and a
16-character fragment for values of 24+ characters (base64 is only found when
the value starts a base64 block). .xlsx/.docx parts are unzipped and read.
Prints only `MATCH <file>:<line> key=<NAME> form=<form>`.
Exit 0 = clean, 1 = match found, 2 = the scan did not fully run (a NOVALUE,
MISSING or SKIPPED line, or an error): fix the arguments; never treat 2 as clean.
"""
import argparse, base64, binascii, html, json, os, re, subprocess, sys, urllib.parse, zipfile

GIT = dict(capture_output=True, encoding="utf-8", errors="replace", check=True)

def read_source(src):
    if ":" in src and not os.path.exists(src) and not re.match(r"^[A-Za-z]:[\\/]", src):
        return subprocess.run(["git", "show", src], **GIT).stdout
    return read_text(src)

def read_text(path):
    with open(path, "rb") as f:
        data = f.read()
    if data[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return data.decode("utf-16", errors="replace")
    return data.decode("utf-8-sig", errors="replace")

def json_lookup(text, key):
    """Values at the key's full path; None when the source is not JSON."""
    try:
        node = json.loads(text)
    except ValueError:
        return None
    for part in re.split(r":|__", key):
        if not isinstance(node, dict):
            return []
        match = [k for k in node if k.lower() == part.lower()]
        if not match:
            return []
        node = node[match[0]]
    return [str(node)] if isinstance(node, (str, int, float)) and str(node) else []

def values_for(text, key):
    found = json_lookup(text, key)
    if found is not None:  # JSON: only the exact path counts
        return found
    names = dict.fromkeys([key, key.replace(":", "__"), key.replace("__", ":"), re.split(r":|__", key)[-1]])
    out = []
    for name in names:
        n = re.escape(name)
        pat = r'(?<![A-Za-z0-9])["\']?%s["\']?\s*[:=]\s*["\']?([^"\'\r\n,}]+)' % n
        out += [re.sub(r"\s+[#;].*$", "", m).strip() for m in re.findall(pat, text, re.I)]
        out += re.findall(r'<add\s+key\s*=\s*["\']%s["\']\s+value\s*=\s*["\']([^"\']*)["\']' % n, text, re.I)
    return [v for v in dict.fromkeys(out) if v and v not in ("|", ">")]

def forms(value):
    raw = value.encode()
    out = {"literal": value, "url": urllib.parse.quote(value, safe=""),
           "hex": binascii.hexlify(raw).decode(),
           "base64": base64.b64encode(raw).decode().rstrip("="),
           "base64url": base64.urlsafe_b64encode(raw).decode().rstrip("=")}
    if len(value) >= 24:
        out["fragment"] = value[4:20]
    return {k: v for k, v in out.items() if len(v) >= 6 and (k == "literal" or v != value)}

def iter_lines(path):
    if path.lower().endswith((".xlsx", ".xlsm", ".docx")):
        with zipfile.ZipFile(path) as z:
            for part in z.namelist():
                if part.endswith((".xml", ".rels", ".vml")):
                    raw = z.read(part).decode("utf-8", errors="replace")
                    for variant in (raw, re.sub(r"<[^>]+>", "", raw)):
                        for i, line in enumerate(html.unescape(variant).splitlines(), 1):
                            yield "%s!%s" % (path, part), i, line
        return
    for i, line in enumerate(read_text(path).splitlines(), 1):
        yield path, i, line

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--source", action="append", default=[])
    ap.add_argument("--key", action="append", default=[])
    ap.add_argument("--pattern", action="append", default=[])
    ap.add_argument("--env", action="append", default=[])
    ap.add_argument("--staged", action="store_true")
    a = ap.parse_args()
    incomplete = False
    secrets = []
    for src in a.source:
        text = read_source(src)
        for key in a.key:
            vals = values_for(text, key)
            if not vals:
                print("NOVALUE key=%s source=%s" % (key, src)); incomplete = True
            secrets += [(key, v) for v in vals]
        for i, pat in enumerate(a.pattern, 1):
            vals = [m if isinstance(m, str) else m[0] for m in re.findall(pat, text)]
            if not vals:
                print("NOVALUE pattern=%d source=%s" % (i, src)); incomplete = True
            secrets += [("pattern%d" % i, v) for v in vals if v]
    for e in a.env:
        if os.environ.get(e):
            secrets.append((e, os.environ[e]))
        else:
            print("NOVALUE env=%s" % e); incomplete = True
    checks = [(k, f, s) for k, v in dict.fromkeys(secrets) for f, s in forms(v).items()]
    hits = 0
    def scan(label, i, line):
        nonlocal hits
        for key, form, s in checks:
            if s in line:
                hits += 1
                print("MATCH %s:%d key=%s form=%s" % (label, i, key, form))
    targets = []
    for p in a.paths:
        if os.path.isdir(p):
            for root, dirs, files in os.walk(p):
                dirs[:] = [d for d in dirs if d not in (".git", "bin", "obj", "node_modules")]
                targets += [os.path.join(root, f) for f in files]
        elif os.path.isfile(p):
            targets.append(p)
        else:
            print("MISSING %s (not scanned)" % p); incomplete = True
    for path in targets:
        try:
            for label, i, line in iter_lines(path):
                scan(label, i, line)
        except (OSError, zipfile.BadZipFile):
            print("SKIPPED %s (could not read)" % path); incomplete = True
    if a.staged:
        diff = subprocess.run(["git", "diff", "--cached", "-U0", "--no-color", "--no-ext-diff",
                               "--src-prefix=a/", "--dst-prefix=b/"], **GIT).stdout
        cur, n, header = "staged", 0, False
        for line in diff.splitlines():
            if line.startswith("diff --git "):
                header = True
            elif header and line.startswith("+++ "):
                cur = line[6:] if line.startswith("+++ b/") else line[4:]
            elif line.startswith("@@"):
                header = False
                m = re.search(r"\+(\d+)", line)
                n = int(m.group(1)) - 1 if m else 0
            elif not header and line.startswith("+"):
                n += 1
                scan("staged:" + cur, n, line[1:])
    print("%d secret value(s) checked, %d match(es)%s" % (len(secrets), hits, ", INCOMPLETE" if incomplete else ""))
    return 1 if hits else (2 if incomplete or not secrets else 0)

if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except BaseException as e:  # never print a traceback: it could echo a value
        print("secret_scan failed: %s" % type(e).__name__)
        sys.exit(2)
```
