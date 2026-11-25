"""Regression tests for secret_scan.py, the script embedded in
core/reference/security-findings.md (the ```python block at the end).

Usage (needs Python 3.8+ and git; run with -I so nothing from the cwd is imported):
    python -I plugins/pai-orbit/scripts/test-secret-scan.py [<script.py>]

With no argument it extracts the script from the reference file, so it tests what
ships. It builds a throwaway git repo in a new temp folder, runs each case, checks
the exit code and output, and checks that no output contains a test value. Every
value is FAKE. The temp folder is deleted at the end. Exit 0 = all cases pass.
Run it after any change to secret_scan.py, before rebuilding dist/.
"""
import base64, binascii, os, re, shutil, stat, subprocess, sys, tempfile, urllib.parse, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
REFERENCE = os.path.join(HERE, "..", "core", "reference", "security-findings.md")
T = tempfile.mkdtemp(prefix="secret-scan-test-")
SCRIPT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else None
# Built in two parts so this file never holds a literal PEM header (secret scanners flag those).
PEM_BEGIN, PEM_END = "-----BEGIN " + "PRIVATE KEY-----", "-----END " + "PRIVATE KEY-----"
OUT = os.path.join(T, "outside")  # not a git repo
R = os.path.join(T, "repo")
FAKE = {
    "jwt": "FAKEjwtSigningKey0123456789abcdefXYZ",
    "pw": "FakePw,}x#9",
    "yaml": "FAKEyamlKeyValue42",
    "ini": "FAKEiniKeyValue77",
    "envq": "FAKE quoted # value",
    "envc": "ab,cd}FAKEcomma",
    "env_inline": "FakeInline99",
    "cfg": "FAKEcfg&Secret55",
    "cfgpw": "FakeCfgPw&88",
    "short4": "Fk4z",
    "short3": "Fk3",
    "xl": "FAKExlsxHidden123",
    "xlc": "FAKExlsxComment456",
    "docx": "FAKEdocxRunSplit789",
    "pptx": "FAKEpptxSlide321",
    "u16": "FAKEutf16Value654",
    "envvar": "FAKEenvVarValue987",
    "basic_user": "svcuser",
    "basic_pw": "FAKEbasicPass11",
    "jc": "https://h/*not-a-comment*/,}FAKEjc",
    "staged": "FAKEstagedText111",
    "stagedx": "FAKEstagedXlsx222",
    "stagedu": "FAKEstagedU16x333",
    "info": "Information",
}
SECRETS = [v for k, v in FAKE.items() if k not in ("info", "basic_user")]
results = []

def w(path, data, mode="w"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if isinstance(data, str):
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(data)
    else:
        with open(path, "wb") as f:
            f.write(data)

def zipf(path, parts):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, text in parts.items():
            z.writestr(name, text)

def xlsx(path, hidden_val, comment_val):
    zipf(path, {
        "[Content_Types].xml": '<?xml version="1.0"?><Types/>',
        "xl/workbook.xml": '<workbook><sheets><sheet name="Findings" sheetId="1"/><sheet name="Notes" sheetId="2" state="hidden"/></sheets></workbook>',
        "xl/sharedStrings.xml": '<sst><si><t>ID</t></si><si><t>Severity</t></si><si><t>High</t></si></sst>',
        "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row></sheetData></worksheet>',
        "xl/worksheets/sheet2.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>%s</t></is></c></row></sheetData></worksheet>' % hidden_val,
        "xl/comments1.xml": '<comments><commentList><comment ref="A1"><text><r><t>note: %s</t></r></text></comment></commentList></comments>' % comment_val,
    })

def run(name, args, expect_exit, expect_match=None, no_match=None, cwd=R, env=None, check_dupes=True, contains=None):
    e = dict(os.environ)
    e.pop("PYTHONIOENCODING", None); e.pop("PYTHONUTF8", None)
    e.update(env or {})
    p = subprocess.run([sys.executable, "-I", SCRIPT] + args, cwd=cwd, capture_output=True, env=e)
    out = p.stdout.decode("utf-8", "replace") + p.stderr.decode("utf-8", "replace")
    problems = []
    if p.returncode != expect_exit:
        problems.append("exit %d, expected %d" % (p.returncode, expect_exit))
    leaked = [s for s in SECRETS if s in out]
    if leaked:
        problems.append("VALUE PRINTED")
    for m in expect_match or []:
        if m not in out:
            problems.append("missing %r" % m)
    for m in no_match or []:
        if m in out:
            problems.append("unexpected %r" % m)
    for m in contains or []:
        if m not in out:
            problems.append("missing %r" % m)
    lines = [l for l in out.splitlines() if l.startswith("MATCH")]
    if check_dupes and len(lines) != len(set(lines)):
        problems.append("duplicate MATCH lines")
    results.append((name, not problems, p.returncode, problems, out))

def git(*a, cwd=R):
    subprocess.run(["git"] + list(a), cwd=cwd, check=True, capture_output=True)

# ---------- fixtures ----------
os.makedirs(OUT)
if SCRIPT is None:  # test the copy that ships, from the reference file
    with open(REFERENCE, encoding="utf-8") as f:
        m = re.search(r"^```python\n(.*?)^```$", f.read().replace("\r\n", "\n"), re.S | re.M)
    SCRIPT = os.path.join(T, "secret_scan.py")
    with open(SCRIPT, "w", encoding="utf-8", newline="\n") as f:
        f.write(m.group(1))
git("init", "-q", R, cwd=T)
git("config", "user.email", "test@example.invalid"); git("config", "user.name", "Test")
git("config", "commit.gpgsign", "false")

w(R + "/appsettings.json", """{
  "Logging": { "LogLevel": { "Default": "%s" } },
  "ConnectionStrings": { "Default": "Server=db;Database=app;User Id=sa;Password=\\"%s\\";" },
  "Jwt": { "Key": "%s", "Issuer": "me" },
  "Empty": { "Key": "" }, "Nul": { "Key": null }
}
""" % (FAKE["info"], FAKE["pw"], FAKE["jwt"]))
w(R + "/appsettings.Commented.json", """{
  // a line comment with "quotes" and Key: nothing
  /* block
     comment */
  "Jwt": {
    "Key": "%s", // trailing comment
    "Other": "x",
  },
}
""" % FAKE["jc"])
w(R + "/.env", "Jwt__Key=\nOther=1\nCommented= # just a comment\nDB_PASS=%s\nAPI_TOKEN=\"%s\"\nSECRET=%s   # inline note\nPIN=%s\nPIN3=%s\nAPI_KEY=apikeyvalue\n" % (
    FAKE["envc"], FAKE["envq"], FAKE["env_inline"], FAKE["short4"], FAKE["short3"]))
w(R + "/settings.ini", "[Other]\nKey=otherIniKey\n\n[Jwt]\n; comment\nKey = %s ; trailing\n" % FAKE["ini"])
w(R + "/config.yaml", """Logging:
  LogLevel:
    Default: Information
ConnectionStrings:
  Default: "Server=y;Pwd=%s"
Jwt:
  Key: %s   # comment
  Nothing: null
  Block: |
    multi
""" % (FAKE["yaml"] + "Pw", FAKE["yaml"]))
w(R + "/web.config", """<?xml version="1.0"?>
<configuration>
  <appSettings><add key="Jwt:Key" value="%s" /></appSettings>
  <connectionStrings><add name="Default" connectionString="Server=x;Password=%s;" /></connectionStrings>
</configuration>
""" % (FAKE["cfg"].replace("&", "&amp;"), FAKE["cfgpw"].replace("&", "&amp;")))
w(R + "/u16src.json", ('{"Jwt":{"Key":"%s"}}' % FAKE["u16"]).encode("utf-16"))  # with BOM
git("add", "-A"); git("commit", "-q", "-m", "base")
w(R + "/.env.removed", "x")  # unused

# targets
D = R + "/docs/wip/sec"
w(D + "/triage.md", "Leaked JWT key copied here: %s\nInformation level logging only.\n" % FAKE["jwt"])
w(D + "/info-only.md", "Default log level is Information.\nThe other INI key is otherIniKey.\n")
w(D + "/env-copy.md", "pass=%s\nquoted=%s\ninline=%s\n" % (FAKE["envc"], FAKE["envq"], FAKE["env_inline"]))
w(D + "/pin.md", "pin is %s here\n" % FAKE["short4"])
w(D + "/conn-pw.md", "the db password is %s\n" % FAKE["pw"])
w(D + "/cfg-copy.md", "%s and %s\n" % (FAKE["cfg"], FAKE["cfgpw"]))
w(D + "/ini-yaml.md", "%s\n%s\n" % (FAKE["ini"], FAKE["yaml"]))
w(D + "/jc.md", "%s\n" % FAKE["jc"])
w(D + "/u16-bom.txt", ("note %s\n" % FAKE["u16"]).encode("utf-16"))
w(D + "/u16-nobom.txt", ("note %s\r\n" % FAKE["u16"]).encode("utf-16-le"))
w(D + "/u16-be-nobom.txt", ("note %s\n" % FAKE["u16"]).encode("utf-16-be"))
w(D + "/forms.md", "hex %s\nbasic Authorization: Basic %s\nurl %s\nfrag ...%s...\nb64mid x%s\n" % (
    binascii.hexlify(FAKE["jwt"].encode()).decode().upper(),
    base64.b64encode(("%s:%s" % (FAKE["basic_user"], FAKE["basic_pw"])).encode()).decode(),
    urllib.parse.quote(FAKE["cfg"], safe=""), FAKE["jwt"][2:22],
    base64.b64encode(b"ab" + FAKE["envvar"].encode() + b"zz").decode()))
xlsx(D + "/tracker-updated.xlsx", FAKE["xl"], FAKE["xlc"])
zipf(D + "/report.docx", {"word/document.xml": '<w:document><w:body><w:p><w:r><w:t>%s</w:t></w:r><w:r><w:t>%s</w:t></w:r></w:p></w:body></w:document>' % (FAKE["docx"][:8], FAKE["docx"][8:])})
zipf(D + "/deck.pptx", {"ppt/slides/slide1.xml": '<p:sld><a:p><a:r><a:t>%s</a:t></a:r></a:p></p:sld>' % FAKE["pptx"]})
zipf(D + "/~$tmpABC", {"ppt/slides/slide1.xml": '<p:sld><a:t>%s</a:t></p:sld>' % FAKE["pptx"]})  # no extension
w(D + "/密钥-é.md", "copy %s\n" % FAKE["jwt"])
w(D + "/bin/Debug/app.dll.config", "%s\n" % FAKE["jwt"])
w(D + "/../clean/clean.md", "nothing here\n")
xlsx(T + "/src-tracker.xlsx", "Password=%s" % FAKE["xl"], "none")

S = ["--source", "appsettings.json"]
# ---------- JSON ----------
run("json nested Jwt:Key", S + ["--key", "Jwt:Key", D + "/triage.md"], 1, ["key=Jwt:Key form=literal"])
run("json Jwt__Key", S + ["--key", "Jwt__Key", D + "/triage.md"], 1, ["key=Jwt__Key form=literal"])
run("json ConnectionStrings:Default not Logging Default", S + ["--key", "ConnectionStrings:Default", D + "/info-only.md"], 0)
run("conn-string bare password found", S + ["--key", "ConnectionStrings:Default", D + "/conn-pw.md"], 1, ["key=ConnectionStrings:Default[Password] form=literal"])
run("json empty value -> NOVALUE", S + ["--key", "Empty:Key", D + "/triage.md"], 2, ["NOVALUE key=Empty:Key"])
run("json null value -> NOVALUE", S + ["--key", "Nul:Key", D + "/triage.md"], 2, ["NOVALUE key=Nul:Key"])
run("json object value -> NOVALUE", S + ["--key", "Jwt", D + "/triage.md"], 2, ["NOVALUE key=Jwt"])
run("json missing key", S + ["--key", "Nope:Key", D + "/triage.md"], 2, ["NOVALUE"])
run("json last segment not used (Key alone)", S + ["--key", "Key", D + "/triage.md"], 2, ["NOVALUE key=Key"])
run("json with comments + trailing commas", ["--source", "appsettings.Commented.json", "--key", "Jwt:Key", D + "/jc.md"], 1, ["form=literal"])
run("utf-16 BOM source", ["--source", "u16src.json", "--key", "Jwt:Key", D + "/u16-bom.txt"], 1, ["u16-bom.txt:1 key=Jwt:Key form=literal"])
# ---------- .env ----------
E = ["--source", ".env"]
run(".env empty then next line -> NOVALUE", E + ["--key", "Jwt__Key", D + "/triage.md"], 2, ["NOVALUE key=Jwt__Key"])
run(".env Jwt:Key maps to Jwt__Key -> NOVALUE", E + ["--key", "Jwt:Key", D + "/triage.md"], 2, ["NOVALUE"])
run(".env comment is not a value", E + ["--key", "Commented", D + "/triage.md"], 2, ["NOVALUE key=Commented"])
run(".env comma/brace value", E + ["--key", "DB_PASS", D + "/env-copy.md"], 1, ["env-copy.md:1 key=DB_PASS form=literal"])
run(".env quoted with #", E + ["--key", "API_TOKEN", D + "/env-copy.md"], 1, ["env-copy.md:2 key=API_TOKEN"])
run(".env inline comment stripped", E + ["--key", "SECRET", D + "/env-copy.md"], 1, ["env-copy.md:3 key=SECRET form=literal"])
run(".env Key not inside API_KEY", E + ["--key", "Key", D + "/env-copy.md"], 2, ["NOVALUE key=Key"])
run("4-char value literal searched", E + ["--key", "PIN", D + "/pin.md"], 1, ["pin.md:1 key=PIN form=literal"])
run("3-char value -> SHORT exit 2", E + ["--key", "PIN3", D + "/pin.md"], 2, ["SHORT key=PIN3"])
# ---------- INI / YAML / XML ----------
run("ini [Jwt] Key", ["--source", "settings.ini", "--key", "Jwt:Key", D + "/ini-yaml.md", D + "/info-only.md"], 1, ["ini-yaml.md:1 key=Jwt:Key"], ["info-only.md"])
run("yaml nested Jwt:Key", ["--source", "config.yaml", "--key", "Jwt:Key", D + "/ini-yaml.md"], 1, ["ini-yaml.md:2 key=Jwt:Key form=literal"])
run("yaml ConnectionStrings:Default not Logging", ["--source", "config.yaml", "--key", "ConnectionStrings:Default", D + "/info-only.md"], 0)
run("yaml null -> NOVALUE", ["--source", "config.yaml", "--key", "Jwt:Nothing", D + "/info-only.md"], 2, ["NOVALUE"])
run("yaml block scalar -> NOVALUE", ["--source", "config.yaml", "--key", "Jwt:Block", D + "/info-only.md"], 2, ["NOVALUE"])
run("web.config appSettings + connectionStrings", ["--source", "web.config", "--key", "Jwt:Key", "--key", "ConnectionStrings:Default", D + "/cfg-copy.md"], 1,
    ["key=Jwt:Key form=literal", "key=ConnectionStrings:Default[Password] form=literal"])
# ---------- encodings / forms ----------
run("utf-16 no BOM LE + BE targets", ["--source", "u16src.json", "--key", "Jwt:Key", D + "/u16-nobom.txt", D + "/u16-be-nobom.txt"], 1, ["u16-nobom.txt:1", "u16-be-nobom.txt:1"])
os.environ["SS_TEST_V"] = FAKE["envvar"]
run("env var + base64 at offset", ["--env", "SS_TEST_V", D + "/forms.md"], 1, ["forms.md:5 key=SS_TEST_V form=base64+2"])
os.environ["SS_TEST_BASIC"] = FAKE["basic_pw"]
run("basic auth user:pass base64", ["--env", "SS_TEST_BASIC", D + "/forms.md"], 1, ["forms.md:2 key=SS_TEST_BASIC form=base64"])
run("upper hex + fragment", S + ["--key", "Jwt:Key", D + "/forms.md"], 1, ["forms.md:1 key=Jwt:Key form=HEX", "forms.md:4 key=Jwt:Key form=fragment"])
run("url-encoded", ["--source", "web.config", "--key", "Jwt:Key", D + "/forms.md"], 1, ["forms.md:3 key=Jwt:Key form=url"])
run("unset env -> NOVALUE", ["--env", "SS_TEST_UNSET", D + "/forms.md"], 2, ["NOVALUE env=SS_TEST_UNSET"])
# ---------- Office ----------
os.environ["SS_XL"] = FAKE["xl"]; os.environ["SS_XLC"] = FAKE["xlc"]
run("xlsx hidden sheet + comment, no dupes", ["--env", "SS_XL", "--env", "SS_XLC", D + "/tracker-updated.xlsx"], 1,
    ["sheet2.xml:1 key=SS_XL form=literal", "comments1.xml:1 key=SS_XLC form=literal"])
os.environ["SS_DOCX"] = FAKE["docx"]; os.environ["SS_PPTX"] = FAKE["pptx"]
run("docx run-split", ["--env", "SS_DOCX", D + "/report.docx"], 1, ["document.xml:1 key=SS_DOCX form=literal"])
run("pptx + extensionless temp zip", ["--env", "SS_PPTX", D + "/deck.pptx", D + "/~$tmpABC"], 1, ["deck.pptx!ppt/slides/slide1.xml", "~$tmpABC!ppt/slides/slide1.xml"])
run("xlsx as --source with --pattern", ["--source", T + "/src-tracker.xlsx", "--pattern", r"Password=([^\s;<]+)", D + "/tracker-updated.xlsx"], 1, ["key=pattern1 form=literal"])
run("pattern with only empty matches -> NOVALUE", S + ["--pattern", r'"Key"\s*:\s*"(x?)"', D + "/triage.md"], 2, ["NOVALUE pattern=1"])
# ---------- folders / errors ----------
run("non-ASCII name, piped cp1252", S + ["--key", "Jwt:Key", D + "/密钥-é.md"], 1, ["MATCH"], env={"PYTHONIOENCODING": "cp1252"})
run("folder with bin/ -> PRUNED exit 2", S + ["--key", "Jwt:Key", D], 1, ["PRUNED"])
os.makedirs(R + "/docs/wip/c2/obj", exist_ok=True); w(R + "/docs/wip/c2/a.md", "nothing\n")
run("clean files but pruned obj -> exit 2 not 0", S + ["--key", "Jwt:Key", R + "/docs/wip/c2"], 2, ["PRUNED", "INCOMPLETE"])
run("clean file -> exit 0", S + ["--key", "Jwt:Key", R + "/docs/wip/clean/clean.md"], 0)
run("no targets -> NOTARGET", S + ["--key", "Jwt:Key"], 2, ["NOTARGET"])
run("missing path", S + ["--key", "Jwt:Key", "nope.md"], 2, ["MISSING nope.md"])
run("missing source", ["--source", "nope.json", "--key", "Jwt:Key", D + "/triage.md"], 2, ["MISSING source=nope.json"])
run("bad revision", ["--source", "nosuchrev:appsettings.json", "--key", "Jwt:Key", D + "/triage.md"], 2, ["MISSING source="])
run("key without source", ["--key", "Jwt:Key", D + "/triage.md"], 2, ["NOSOURCE"])
run("bad regex -> exit 2 no traceback", S + ["--pattern", "(", D + "/triage.md"], 2, ["BADPATTERN pattern=1"], ["Traceback"])
run("outside repo: rev source", ["--source", "HEAD:appsettings.json", "--key", "Jwt:Key", D + "/triage.md"], 2, ["MISSING source="], cwd=OUT)
run("outside repo: --staged", ["--env", "SS_XL", "--staged"], 2, ["secret_scan failed: CalledProcessError"], cwd=OUT)
# ---------- git revision source ----------
w(R + "/appsettings.json", '{"Jwt":{"Key":"from-env"}}')
run("REV source after removal", ["--source", "HEAD:appsettings.json", "--key", "Jwt:Key", D + "/triage.md"], 1, ["triage.md:1 key=Jwt:Key form=literal"])
git("checkout", "--", "appsettings.json")
# ---------- staged ----------
git("config", "color.ui", "always"); git("config", "diff.noprefix", "true"); git("config", "diff.mnemonicPrefix", "true")
w(R + "/.gitattributes", "*.md diff=fake\n"); git("config", "diff.fake.textconv", "sh -c 'echo REDACTED'")
w(R + "/src/new file.cs", "// key\nvar k = \"%s\";\n" % FAKE["staged"])
xlsx(R + "/findings/tracker copy.xlsx", FAKE["stagedx"], "c")
w(R + "/src/u16.txt", ("x %s\n" % FAKE["stagedu"]).encode("utf-16"))
w(R + "/docs/a.md", "line\n%s\n" % FAKE["staged"])
git("add", "src/new file.cs", "findings/tracker copy.xlsx", "src/u16.txt", "docs/a.md", ".gitattributes")
os.environ["SS_ST"] = FAKE["staged"]; os.environ["SS_STX"] = FAKE["stagedx"]; os.environ["SS_STU"] = FAKE["stagedu"]
run("staged text/xlsx/utf-16, color.ui=always, textconv, space in name", ["--env", "SS_ST", "--env", "SS_STX", "--env", "SS_STU", "--staged"], 1,
    ["MATCH staged:src/new file.cs:2 key=SS_ST", "MATCH staged:docs/a.md:2 key=SS_ST",
     "staged:findings/tracker copy.xlsx!xl/worksheets/sheet2.xml:1 key=SS_STX", "staged:src/u16.txt:1 key=SS_STU"], ["\t"])
run("staged from a subfolder", ["--env", "SS_STX", "--staged"], 1, ["staged:findings/tracker copy.xlsx"], cwd=R + "/src")
git("reset", "-q")
run("staged nothing -> clean", ["--env", "SS_ST", "--staged"], 0)

# ---------- round 1 review cases ----------
import gzip, io
PEM_L1, PEM_L2 = "FAKEpemBodyLineOne0123456789abcdefABCDEF", "FAKEpemBodyLineTwo9876543210"
R1 = {"redis": "FAKEredisPw77", "sas": "FAKEsasKey123456", "esc": 'FAKE"esc"val', "cafe": "FAKEcaféValue9",
      "pdf": "FAKEpdfValue444", "bin16": "FAKEbinUtf16Val5", "deep": "FAKEdeepZipVal6", "app": "FAKEappendedVal7",
      "gz": "FAKEgzipValue888", "envpw": "FAKEenvPassword12345"}
SECRETS += list(R1.values()) + [PEM_L1, PEM_L2]
X = R + "/docs/wip/r1"
os.environ["SS_PEM"] = "%s\n%s\n%s\n%s\n" % (PEM_BEGIN, PEM_L1, PEM_L2, PEM_END)
os.environ["SS_SHORTML"] = "abc\ndefgh\n"
w(X + "/pem-line.md", "copied: %s\n" % PEM_L2)
w(X + "/pem-header.md", "Keys look like %s in PEM files.\n" % PEM_BEGIN)
run("PEM body line found", ["--env", "SS_PEM", X + "/pem-line.md"], 1, ["key=SS_PEM[line 3] form=literal"])
run("PEM header alone is not a match", ["--env", "SS_PEM", X + "/pem-header.md"], 0)
run("multi-line with a 3-char line -> SHORT exit 2", ["--env", "SS_SHORTML", X + "/pem-header.md"], 2, ["SHORT key=SS_SHORTML[line 1]"])
w(R + "/pw.env", "Password=%s\nNEXT=1\n" % R1["envpw"])
w(X + "/pw-copy.md", "bare %s\n" % R1["envpw"])
run("pattern stopping at line end", ["--source", "pw.env", "--pattern", r'Password=([^;"\r\n]+)', X + "/pw-copy.md"], 1, ["key=pattern1 form=literal"])
run("pattern reading past line, long value: still found", ["--source", "pw.env", "--pattern", r'Password=([^;"]+)', X + "/pw-copy.md"], 1, ["key=pattern1[line 1] form=literal"])
w(R + "/pw2.env", "Password=FakeShort9\nNEXT=1\n")
w(X + "/pw2-copy.md", "bare FakeShort9\n"); SECRETS.append("FakeShort9")
run("pattern reading past line, short first line still searched", ["--source", "pw2.env", "--pattern", r'Password=([^;"]+)', X + "/pw2-copy.md"], 1, ["key=pattern1[line 1] form=literal"])
run("pattern without group -> NOGROUP", ["--source", "pw.env", "--pattern", r"Password=[^;]+", X + "/pw-copy.md"], 2, ["NOGROUP pattern=1"])
w(X + "/doc.pdf", b"%PDF-1.7\n1 0 obj<</Filter/FlateDecode>>stream\nx\x9c\x01\x02endstream\n")
w(X + "/lfs.xlsx", "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 12\n")
os.environ["SS_R1PDF"] = R1["pdf"]
run("PDF -> PARTIAL", ["--env", "SS_R1PDF", X + "/doc.pdf"], 2, ["PARTIAL", "PDF"])
run("LFS pointer target -> PARTIAL", ["--env", "SS_R1PDF", X + "/lfs.xlsx"], 2, ["PARTIAL", "Git LFS"])
w(X + "/ole.bin", b"\x00\x01HDR\x00" + R1["bin16"].encode("utf-16-le") + b"\xff\xfe\x00")
w(X + "/ole-odd.bin", b"\x00\x01H" + R1["bin16"].encode("utf-16-le") + b"\xff\x00")
os.environ["SS_BIN16"] = R1["bin16"]
run("UTF-16LE string inside binary (even + odd offset)", ["--env", "SS_BIN16", X + "/ole.bin", X + "/ole-odd.bin"], 1, ["ole.bin:", "ole-odd.bin:"])
def zbytes(name, data):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(name, data)
    return b.getvalue()
deep = zbytes("a.txt", R1["deep"])
for i in range(4):
    deep = zbytes("n%d.zip" % i, deep)
w(X + "/deep.zip", deep)
os.environ["SS_DEEP"] = R1["deep"]
run("zip nested too deep -> PARTIAL", ["--env", "SS_DEEP", X + "/deep.zip"], 2, ["PARTIAL", "too deep"])
w(X + "/appended.bin", ("header %s\n" % R1["app"]).encode() + zbytes("x.txt", "nothing"))
os.environ["SS_APP"] = R1["app"]
run("text before an appended zip is read", ["--env", "SS_APP", X + "/appended.bin"], 1, ["appended.bin:1 key=SS_APP"])
w(X + "/data.json.gz", gzip.compress(('{"k":"%s"}' % R1["gz"]).encode()))
os.environ["SS_GZ"] = R1["gz"]
run("gzip unpacked", ["--env", "SS_GZ", X + "/data.json.gz"], 1, ["data.json.gz!gunzip:1 key=SS_GZ"])
w(R + "/redis.env", "REDIS=cache:6379,password=%s,ssl=False,abortConnect=False\n" % R1["redis"])
w(X + "/redis-copy.md", "pw %s\n" % R1["redis"])
run("comma-separated connection string split", ["--source", "redis.env", "--key", "REDIS", X + "/redis-copy.md"], 1, ["key=REDIS[password] form=literal"])
w(R + "/sb.env", "SB=Endpoint=sb://x.example.invalid/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=%s\n" % R1["sas"])
w(X + "/sb-policy.md", "Uses the RootManageSharedAccessKey policy.\n")
w(X + "/sb-copy.md", "key %s\n" % R1["sas"])
run("...KeyName part is not a secret", ["--source", "sb.env", "--key", "SB", X + "/sb-policy.md"], 0)
run("SharedAccessKey part found", ["--source", "sb.env", "--key", "SB", X + "/sb-copy.md"], 1, ["key=SB[SharedAccessKey] form=literal"])
w(R + "/esc.env", 'ESC="FAKE\\"esc\\"val"\n')
w(X + "/esc-copy.md", 'plain %s\njson "%s"\n' % (R1["esc"], R1["esc"].replace('"', '\\"')))
run("escaped quote unescaped + JSON-escaped copy", ["--source", "esc.env", "--key", "ESC", X + "/esc-copy.md"], 1, ["esc-copy.md:1 key=ESC form=literal", "esc-copy.md:2 key=ESC form=json"])
os.environ["SS_URLV"] = "FAKE/url=Val99"; SECRETS.append("FAKE/url=Val99")
w(X + "/url-lower.md", "u=FAKE%2furl%3dVal99\n")
run("lower-case URL encoding", ["--env", "SS_URLV", X + "/url-lower.md"], 1, ["form=url-lower"])
w(X + "/cp1252.csv", ("id,note\n1,%s\n" % R1["cafe"]).encode("cp1252"))
os.environ["SS_CAFE"] = R1["cafe"]
run("cp1252 csv with non-ASCII value", ["--env", "SS_CAFE", X + "/cp1252.csv"], 1, ["cp1252.csv:2 key=SS_CAFE form=literal"])
w(R + "/big.xlsx", "version https://git-lfs.github.com/spec/v1\noid sha256:0123\nsize 99\n")
git("add", "big.xlsx")
run("staged LFS pointer -> PARTIAL", ["--env", "SS_ST", "--staged"], 2, ["PARTIAL staged:big.xlsx"])
git("reset", "-q")

# ---------- round 2 review cases ----------
import bz2, lzma
Y = R + "/docs/wip/r2"
CONN = "Server=db;Database=app;User Id=sa;Password=\"%s\";" % FAKE["pw"]
w(Y + "/redacted.md", "Fixed config: Server=db;Database=app;User Id=sa;Password=<from env>;\n")
run("redacted connection string is not a match (no fragment)", S + ["--key", "ConnectionStrings:Default", Y + "/redacted.md"], 0)
w(R + "/appsettings.json", '{"ConnectionStrings":{"Default":"Server=db;Database=app;User Id=sa;"},"Jwt":{"Key":"from-env"}}\n')
git("add", "appsettings.json")
run("staged secrets fix passes", ["--source", "HEAD:appsettings.json", "--key", "ConnectionStrings:Default", "--key", "Jwt:Key", "--staged"], 0)
git("reset", "-q"); git("checkout", "--", "appsettings.json")
xlsx(T + "/prose-tracker.xlsx", "Password=%s is committed in appsettings.json" % R1["envpw"], "none")
run("tracker prose: stop-at-space regex finds bare copy", ["--source", T + "/prose-tracker.xlsx", "--pattern", r"""Password=([^\s;"']+)""", X + "/pw-copy.md"], 1, ["key=pattern1 form=literal"])
run("tracker prose: line-end regex over-reads -> SPACES noted", ["--source", T + "/prose-tracker.xlsx", "--pattern", r'Password=([^;"\r\n]+)', X + "/pw-copy.md"], 1, ["SPACES pattern=1", "INCOMPLETE"])
xlsx(T + "/prose2.xlsx", "Password=FAKEshrt12 is committed in appsettings.json", "none"); SECRETS.append("FAKEshrt12")
w(Y + "/shrt.md", "bare FAKEshrt12\n")
run("tracker prose, short value: over-read is not clean (exit 2)", ["--source", T + "/prose2.xlsx", "--pattern", r'Password=([^;"\r\n]+)', Y + "/shrt.md"], 2, ["SPACES pattern=1"])
os.environ["SS_CHUNK"] = "Fk9;xQzKey=Vv77WwPart"; SECRETS += ["Fk9;xQzKey=Vv77WwPart", "xQzKey", "Vv77WwPart"]
w(Y + "/chunk.md", "copy Vv77WwPart\n")
run("odd part name not printed (part<N>)", ["--env", "SS_CHUNK", Y + "/chunk.md"], 1, ["key=SS_CHUNK[part1] form=literal"])
os.environ["SS_QUOTE"] = 'FAKE"quoted"Val'; SECRETS.append('FAKE"quoted"Val')
w(Y + "/copy.csv", 'id,note\n1,"FAKE""quoted""Val"\n')
run("CSV doubled quotes", ["--env", "SS_QUOTE", Y + "/copy.csv"], 1, ["copy.csv:2 key=SS_QUOTE form=csv"])
os.environ["SS_PACK"] = "FAKEpackedValue31"; SECRETS.append("FAKEpackedValue31")
w(Y + "/d.txt.bz2", bz2.compress(b"x FAKEpackedValue31 y"))
w(Y + "/d.txt.xz", lzma.compress(b"x FAKEpackedValue31 y"))
run("bzip2 + xz unpacked", ["--env", "SS_PACK", Y + "/d.txt.bz2", Y + "/d.txt.xz"], 1, ["d.txt.bz2!bunzip2:1", "d.txt.xz!unxz:1"])
os.environ["SS_ASCIIBIN"] = "FAKEasciiInBin99"; SECRETS.append("FAKEasciiInBin99")
w(Y + "/fake-utf16.bin", b"A\x00" * 3000 + b"\x01\x02 FAKEasciiInBin99 \x03")
run("ASCII value in binary that looks like UTF-16 up front", ["--env", "SS_ASCIIBIN", Y + "/fake-utf16.bin"], 1, ["fake-utf16.bin:"])
gz3 = b"x FAKEpackedValue31"
for _ in range(4):
    gz3 = gzip.compress(gz3)
w(Y + "/deep.gz", gz3)
run("gzip nested too deep -> PARTIAL", ["--env", "SS_PACK", Y + "/deep.gz"], 2, ["PARTIAL", "packed too deep"])

# ---------- round 3 review cases ----------
xlsx(T + "/prose3.xlsx", "The app uses Password=FAKEpunct9, which is weak (see A1).", "none"); SECRETS.append("FAKEpunct9")
w(Y + "/punct.md", "bare FAKEpunct9 here\n")
run("tracker prose: trailing comma removed", ["--source", T + "/prose3.xlsx", "--pattern", r"""Password=([^\s;"']+)""", Y + "/punct.md"], 1, ["punct.md:1 key=pattern1 form=literal"])
run("over-reading pattern across lines: lines searched, no false SPACES", ["--source", "pw2.env", "--pattern", r'Password=([^;"]+)', Y + "/punct.md"], 0, None, ["SPACES"])
w(Y + "/bzh.txt", "BZh is how this note starts; nothing secret.\n")
run("text starting with BZh is not bzip2", ["--env", "SS_PACK", Y + "/bzh.txt"], 0)

# ---------- round 4 review cases ----------
PEMV = "MIIBFAKEpemKeyBodyLine0123456789abcdefABCDEFGHIJ"; SECRETS.append(PEMV)
w(R + "/certs/server.key", "%s\n%s\nZw==\n%s\n" % (PEM_BEGIN, PEMV, PEM_END))
w(Y + "/pem-clean.md", "nothing here\n")
w(Y + "/pem-leak.md", "leaked %s\n" % PEMV)
PEMPAT = r"(?s)-----BEGIN [A-Z ]+-----\s*(.*?)\s*-----END"
run("PEM via --pattern: clean doc -> exit 0", ["--source", "certs/server.key", "--pattern", PEMPAT, Y + "/pem-clean.md"], 0, None, ["SPACES"])
run("PEM via --pattern: leaked line -> exit 1", ["--source", "certs/server.key", "--pattern", PEMPAT, Y + "/pem-leak.md"], 1, ["key=pattern1[line 1] form=literal"])
cells = ["(see Password=FAKEparen7).", "Password=FAKEsmart8”, weak", "Password=`FAKEtick99`", "Password=FAKEellip6…"]
vals = ["FAKEparen7", "FAKEsmart8", "FAKEtick99", "FAKEellip6"]; SECRETS += vals
for n, (cell, val) in enumerate(zip(cells, vals)):
    xlsx(T + "/punct%d.xlsx" % n, cell, "none")
    w(Y + "/punct%d.md" % n, "bare %s\n" % val)
    run("tracker prose punctuation %d" % n, ["--source", T + "/punct%d.xlsx" % n, "--pattern", r"""Password=([^\s;"'<>]+)""", Y + "/punct%d.md" % n], 1, ["form=literal"])
w(R + "/tracker.html", "<table><tr><td>Password=FAKEhtmlCell5</td></tr></table>\n"); SECRETS.append("FAKEhtmlCell5")
w(Y + "/html.md", "bare FAKEhtmlCell5\n")
run("HTML cell source with documented regex", ["--source", "tracker.html", "--pattern", r"""Password=([^\s;"'<>]+)""", Y + "/html.md"], 1, ["form=literal"])

# ---------- round 5 review cases ----------
for n, cell in enumerate(["Password=“q7Z”", "Password=`q7Z`", "(Password=q7Z)"]):
    xlsx(T + "/short%d.xlsx" % n, cell, "none")
    run("short value in punctuation %d -> SHORT exit 2" % n, ["--source", T + "/short%d.xlsx" % n, "--pattern", r"""Password=([^\s;"'<>]+)""", Y + "/punct.md"], 2, ["SHORT pattern=1"])
xlsx(T + "/masked.xlsx", "Password=****.", "none")
run("masked **** cell is not SHORT", ["--source", T + "/masked.xlsx", "--pattern", r"""Password=([^\s;"'<>]+)""", Y + "/punct.md"], 0, None, ["SHORT"])
xlsx(T + "/nbsp.xlsx", "Password=FAKEnbsp77 is weak", "none"); SECRETS.append("FAKEnbsp77")
run("NBSP after value with ASCII-space regex -> SPACES", ["--source", T + "/nbsp.xlsx", "--pattern", r"""Password=([^ ;"']+)""", Y + "/punct.md"], 2, ["SPACES pattern=1"])
zipf(T + "/overread.xlsx", {"xl/sharedStrings.xml": "<sst><si><t>Password=“FAKEover88”</t></si><si><t>SF-05</t></si><si><t>Critical</t></si></sst>"}); SECRETS.append("FAKEover88")
w(Y + "/over.md", "commit msg FAKEover88\n")
run("over-reading regex across cells: trimmed lines found", ["--source", T + "/overread.xlsx", "--pattern", r'Password=([^;"]+)', Y + "/over.md"], 1, ["form=literal"])
run("PEM with Zw== line still exit 0 when clean", ["--source", "certs/server.key", "--pattern", PEMPAT, Y + "/pem-clean.md"], 0, None, ["SHORT", "SPACES"])

# ---------- final review cases: JS/.NET and form URL encoding ----------
os.environ["SS_JSURL"] = "FakeDbP@ss!2026"; SECRETS.append("FakeDbP@ss!2026")
w(Y + "/jsurl.md", "evidence: pwd=FakeDbP%40ss!2026&x=1\n")
run("encodeURIComponent-style copy (! kept)", ["--env", "SS_JSURL", Y + "/jsurl.md"], 1, ["jsurl.md:1 key=SS_JSURL form=url-js"])
os.environ["SS_FORMURL"] = "FAKE pw*(x)9"; SECRETS.append("FAKE pw*(x)9")
w(Y + "/formurl.md", "body: password=FAKE+pw*%28x%299\n")
run("form-encoded copy (space as +, * kept)", ["--env", "SS_FORMURL", Y + "/formurl.md"], 1, ["formurl.md:1 key=SS_FORMURL form=url-plus"])
run("URL forms add no false match on a clean file", ["--env", "SS_JSURL", "--env", "SS_FORMURL", Y + "/pem-clean.md"], 0)

# ---------- report ----------
ok = sum(1 for r in results if r[1])
for name, passed, code, problems, out in results:
    print("%s  %-60s exit=%d %s" % ("PASS" if passed else "FAIL", name, code, "; ".join(problems)))
    if not passed:
        print("    " + out.replace("\n", "\n    "))
print("\n%d/%d passed" % (ok, len(results)))
shutil.rmtree(T, onerror=lambda f, p, e: (os.chmod(p, stat.S_IWRITE), f(p)))  # git objects are read-only on Windows
sys.exit(0 if ok == len(results) else 1)
