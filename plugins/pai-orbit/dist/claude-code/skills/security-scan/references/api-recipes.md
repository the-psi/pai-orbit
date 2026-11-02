# Advisory & Registry API Recipes

Verified request shapes. OSV.dev is the universal layer — it covers every ecosystem in
`ecosystems.md`, so it works even when no native toolchain is installed.

## 1. OSV.dev — cross-ecosystem vulnerability lookup

### Batch query (preferred — many packages per call)
```bash
curl -s -X POST https://api.osv.dev/v1/querybatch \
  -H 'Content-Type: application/json' \
  -d '{"queries":[
        {"package":{"name":"<name>","ecosystem":"npm"},"version":"1.2.3"},
        {"package":{"name":"<name>","ecosystem":"PyPI"},"version":"4.5.6"}
      ]}'
```
Ecosystem ids are case-sensitive: `npm`, `NuGet`, `PyPI`, `Go`, `Maven`, `RubyGems`,
`Packagist`, `crates.io`, `Hex`, `Pub`, and OS ecosystems (`Debian`, `Alpine`, `Ubuntu`).
Maven names use `groupId:artifactId`. Go names are full module paths.

The batch response is `{"results":[{"vulns":[{"id":"...","modified":"..."}, ...]}, ...]}` — one
result object per input query, **positionally aligned with the input array** (not a flat ID list),
each holding a `vulns` array of `{id, modified}` pairs (an empty `vulns: []` or a result with no
`vulns` key means no hit for that query). Preserve your input order to map `results[i]` back to
`queries[i]`, then fetch full detail per id via the detail endpoint below.

### Detail fetch per ID
```bash
curl -s https://api.osv.dev/v1/vulns/<id>
```
Take from the detail payload: `summary`, `severity` (CVSS vector), `database_specific.severity`,
`affected[].ranges` (→ the fixed version), `affected[].ecosystem_specific`, and `aliases`
(→ the CVE number and any GHSA id).

### Single query by commit (for vendored/unpinned source)
```bash
curl -s -X POST https://api.osv.dev/v1/query -H 'Content-Type: application/json' \
  -d '{"commit":"<sha>"}'
```

### Practical batching
- Chunk to ~100 queries per POST; larger payloads get unreliable.
- Feed every **resolved** `name@version` from the lockfile, including transitives.
- Persist raw JSON to the scratchpad so consolidation can re-read without re-querying.
- Rate-limit politely; add a short sleep between chunks on large trees.

### MANDATORY positive control (gotchas #4)
Before reporting an empty result, query a package/version you have independently confirmed
carries an advisory (an old major release of a widely used library in that ecosystem) and
confirm a non-empty response. Do it once per ecosystem. If the control returns nothing, the
query shape is wrong — an empty response from a malformed request is indistinguishable from
a clean bill of health. Record the control result in the report.

## 2. Native audit commands
See `ecosystems.md` for the per-ecosystem table. Run the native tool when the toolchain
supports it (it catches ecosystem-specific advisory sources OSV may lag on) AND cross-check
with OSV. When the toolchain cannot restore the project, say so rather than reporting clean.

Lockfile-only modes avoid needing installed dependencies, e.g.:
```bash
npm audit --package-lock-only --json
```

## 3. Registry metadata — freshness and deprecation
Pattern is the same everywhere: fetch the package document, read the latest version, the
per-version publish timestamps, and any deprecation/yank flag.

```bash
# npm — dist-tags.latest + the `time` map of version -> ISO publish date
curl -s https://registry.npmjs.org/<pkg> | jq '{latest:.["dist-tags"].latest, times:.time}'
#   scoped packages: URL-encode the slash -> @scope%2Fname
#   .versions[<v>].deprecated holds the deprecation message

# PyPI — info.version, info.yanked, releases[<v>][].upload_time_iso_8601
curl -s https://pypi.org/pypi/<pkg>/json | jq '{latest:.info.version, yanked:.info.yanked}'

# NuGet — latest version
curl -s https://api.nuget.org/v3/registration5-semver1/<lowercase-name>/index.json
# NuGet — DEPRECATION / unlisted live ONLY on the gz-semver2 feed (gzipped: use --compressed)
curl -s --compressed https://api.nuget.org/v3/registration5-gz-semver2/<lowercase>/index.json
#   -> catalogEntry.deprecation {reasons,message,alternatePackage}, catalogEntry.listed

# RubyGems, crates.io, Packagist, Go proxy, Maven Central
curl -s https://rubygems.org/api/v1/versions/<gem>.json
curl -s https://crates.io/api/v1/crates/<name>
curl -s https://repo.packagist.org/p2/<vendor>/<pkg>.json
curl -s https://proxy.golang.org/<module>/@v/list
curl -s https://repo1.maven.org/maven2/<group/path>/<artifact>/maven-metadata.xml
```
Before relying on any of these to prove a NEGATIVE ("nothing is deprecated"), apply
gotchas #2: confirm on a record known to carry the field that this endpoint returns it.

Derive for the maintenance axis (reported separately from advisories):
- installed-version age = `now − publish date of the installed version`
- upstream liveness = `now − publish date of the latest version`
- explicit deprecation / yank / unlisted flags; archived or deleted source repository

## 4. Container and OS-package scanning
```bash
trivy image --severity HIGH,CRITICAL <image:tag>
trivy fs --scanners vuln,secret,misconfig .
grype <image:tag>
syft <image:tag> -o cyclonedx-json      # SBOM
```

## 5. SBOM generation
```bash
syft dir:. -o cyclonedx-json=sbom.cdx.json      # any ecosystem
cdxgen -o sbom.json                              # multi-language
npm sbom --sbom-format cyclonedx                 # npm native
dotnet CycloneDX <solution>                      # .NET
```
Record the format (CycloneDX / SPDX), the generator, and which manifests it covered.

## 6. Secret-scanning tools (complement, not replace, the regex sweep)
```bash
gitleaks detect --source . --no-git --redact
gitleaks detect --source . --log-opts="--all" --redact   # history, needs .git
trufflehog filesystem . --results=verified,unknown
```

## 7. Advisory URLs to cite
- GitHub Advisory — `https://github.com/advisories/GHSA-xxxx-xxxx-xxxx`
- NVD — `https://nvd.nist.gov/vuln/detail/CVE-YYYY-NNNNN`
- OSV — `https://osv.dev/vulnerability/<id>`
Cite at least one per dependency finding so the reader can verify it independently.
