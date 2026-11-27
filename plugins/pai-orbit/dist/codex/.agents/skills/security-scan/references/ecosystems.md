# Ecosystem Matrix

Detect which rows apply in Phase 0, then scope dependency agents to those rows only.

| Ecosystem | Manifests / lockfiles | OSV `ecosystem` id | Native audit command | Registry API (latest + metadata) |
|---|---|---|---|---|
| JavaScript / Node | `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` | `npm` | `npm audit --package-lock-only --json` · `yarn npm audit --json` · `pnpm audit --json` | `https://registry.npmjs.org/<pkg>` |
| .NET | `*.csproj`, `*.sln`, `Directory.Packages.props`, `packages.lock.json`, `packages.config` | `NuGet` | `dotnet list package --vulnerable --include-transitive` | `https://api.nuget.org/v3/registration5-gz-semver2/<lowercase>/index.json` |
| Python | `requirements*.txt`, `pyproject.toml`, `poetry.lock`, `Pipfile.lock`, `uv.lock` | `PyPI` | `pip-audit -r requirements.txt` · `pip-audit` (env) | `https://pypi.org/pypi/<pkg>/json` |
| Go | `go.mod`, `go.sum` | `Go` | `govulncheck ./...` | `https://proxy.golang.org/<module>/@v/list` |
| Java / JVM | `pom.xml`, `build.gradle(.kts)`, `gradle.lockfile` | `Maven` | `mvn org.owasp:dependency-check-maven:check` · `gradle dependencyCheckAnalyze` | `https://repo1.maven.org/maven2/<group-path>/<artifact>/maven-metadata.xml` |
| Ruby | `Gemfile`, `Gemfile.lock` | `RubyGems` | `bundle audit check --update` | `https://rubygems.org/api/v1/versions/<gem>.json` |
| PHP | `composer.json`, `composer.lock` | `Packagist` | `composer audit --format=json` | `https://repo.packagist.org/p2/<vendor>/<pkg>.json` |
| Rust | `Cargo.toml`, `Cargo.lock` | `crates.io` | `cargo audit --json` | `https://crates.io/api/v1/crates/<name>` |
| Container base images | `Dockerfile*`, image refs | `Debian`/`Alpine`/`Ubuntu` (OS pkgs) | `trivy image <ref>` · `grype <ref>` | registry manifest / label inspection |

Notes that apply to every row:
- **OSV.dev is the universal cross-ecosystem fallback.** Native audit tools disagree with each
  other and with OSV in both directions. Run the native tool when the toolchain supports it,
  and cross-check every resolved `name@version` against OSV regardless. When no native tool is
  installed, OSV alone is still a complete-coverage option — say which you used.
- **Query resolved versions from the LOCKFILE, not declared ranges.** Declared ranges miss
  transitive packages, which is where most advisories live. If no lockfile exists, say so:
  the scan then describes a resolution that may not match what actually ships.
- **Native audit tools need a working toolchain.** If the installed runtime/SDK cannot restore
  or build the project, the tool fails and transitives go unscanned — declare it as a coverage
  limitation instead of reporting a clean result (see `gotchas.md` #3).
- **Version-pin manifests** (`Directory.Packages.props`, `gradle.lockfile`, constraints files,
  `overrides`/`resolutions`) are themselves audit targets, not just inputs.
- **Monorepos**: enumerate every workspace manifest, not just the root one.

## Maintenance-risk signals per registry
Each registry API above exposes publish dates and/or deprecation state. Use them for the
maintenance axis, which is reported SEPARATELY from advisories (`gotchas.md` #8):
- last publish date of the installed version → how stale is this pin
- last publish date of the latest version → is upstream itself abandoned
- explicit deprecation / yank / unlisted flags → maintainer has disowned it
- archived or deleted source repository → no fix will ever arrive
- runtime/framework EOL dates (language runtimes, framework majors, base images)
