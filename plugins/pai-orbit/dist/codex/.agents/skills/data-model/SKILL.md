---
name: data-model
description: Data model reference and schema change management — document the current schema, propose and validate schema changes, plan migrations. TRIGGER when designing a new table or field, when modifying an existing schema, when asked about what a table contains or how tables join, or before writing a query against an unfamiliar table. SKIP pure query exploration with no schema change (use /data) and high-level data architecture decisions (use /design).
---

# Data Model

Schema reference and change management for the project's data stores.

Reads from:
- `AGENTS.md` — primary data stores, key tables, natural keys, and known gotchas
- Live schema (via introspection commands or migration files)
- `docs/decisions/` — ADRs that record past schema decisions

---

## Reference: read the current schema

Before writing a query or proposing a change, read the current schema:

```bash
# BigQuery
bq show --schema --format=prettyjson <project>:<dataset>.<table>

# PostgreSQL
\d <table_name>

# MySQL / MariaDB
DESCRIBE <table>;

# SQLite
.schema <table>

# Check migration files (if using an ORM)
ls migrations/ | tail -5
```

When asked "what's in table X" or "how do X and Y join":
1. Read the schema
2. Check `AGENTS.md` for documented natural keys and gotchas
3. Answer with: columns + types, natural key, notable nullable columns, known join path

---

## Proposing a schema change

When asked to add a field, rename a column, or create a table:

### 1. State the change precisely

- Table name
- Column name, type, nullable/not-null, default
- Why this column is needed (link to feature requirements)

### 2. Check for conflicts

- Does a column with this name or purpose already exist?
- Does this change affect any existing queries or indexes?
- Will NULL rows appear for existing records — is that acceptable?

### 3. Draft the migration

Write the migration in the project's migration format:

**BigQuery (schema update):**
```bash
bq update <project>:<dataset>.<table> <schema-file>.json
# Or for adding a nullable column only:
bq query --use_legacy_sql=false \
  "ALTER TABLE <dataset>.<table> ADD COLUMN IF NOT EXISTS <col> <type>"
```

**PostgreSQL / MySQL (migration file):**
```sql
-- up
ALTER TABLE <table> ADD COLUMN <col> <type> [DEFAULT <val>] [NOT NULL];

-- down
ALTER TABLE <table> DROP COLUMN <col>;
```

Always write a rollback (down migration) alongside the up migration.

### 4. Assess impact

- Which queries need updating after this change?
- Which API response models need a new field?
- Which frontend types need updating?

Use `/analysis` if the blast radius is non-trivial.

### 5. Document

After the change lands, update `AGENTS.md` → Data Model section with:
- New table or column
- Natural key (if new table)
- Any gotchas (e.g., STRUCT fields returned as dicts, nullable semantics)

If it's a significant schema decision, record an ADR in `docs/decisions/`.

---

## Schema change safety rules

- **Never drop a column without a deprecation period** — check for any consumer first via `/analysis`
- **Prefer nullable new columns** — NOT NULL requires a default or a backfill before the migration runs
- **Test migrations on a copy of production data** before running on prod, for any table with > 100k rows
- **BigQuery:** table schema changes are limited (cannot rename columns, cannot change types); plan accordingly
- **Never modify a migration file that has already been applied** — write a new one instead
