# WinReach accounts — database & schema

The setup app can persist **admin logins** and **user accounts (agent keys)** in a
database so they can be managed at runtime. During onboarding you choose one of:

- **Local SQLite** — the app creates and manages a file for you (zero setup).
- **Bring your own database** — point the app at PostgreSQL, MySQL, or MongoDB.
  The app **creates the tables/collections if they don't exist**, or, if you've
  already created a table that matches the schema below, **uses it as‑is**.

The app is **additive and non‑destructive**: it only ever *creates* missing
tables/collections and *validates* that the required columns/fields are present.
It never drops or destructively alters an existing schema, and it ignores any
extra columns/fields you add — so you can extend the schema for your own needs.

> Connect the app to your database over **TLS**, and serve the app over
> **HTTPS**, so data is encrypted in transit. See the security model below for
> encryption at rest.

## Security model

| Data | How it's stored | Why |
| --- | --- | --- |
| Admin password | **scrypt** hash (salted, slow) | login; never reversible |
| Agent token (key) | **SHA‑256** hash (`token_hash`) | authentication + lookup; tokens are 256‑bit random, so a fast hash is safe |
| Agent token (copy) | **AES‑256‑GCM** ciphertext (`token_enc`) or null | optional, so an operator can re‑reveal a key; decryptable only with `WINREACH_DB_KEY` |
| Everything | TLS in transit | end‑to‑end transport encryption |

- A bearer token is **never stored in plaintext.** It is shown to the operator
  **once** at creation; after that only its SHA‑256 hash (and an optional
  AES‑GCM‑encrypted copy) is kept.
- Set **`WINREACH_DB_KEY`** (a long random secret) to enable the encrypted copy.
  Losing it means encrypted copies can't be decrypted (hashes still authenticate).
- WinReach authenticates an agent by hashing the presented bearer token and
  comparing it to `token_hash` (constant‑time). The generated
  `WINREACH_PRINCIPALS` carries `tokenHash`, not the plaintext key.

## Canonical schema (SQL)

Table/column names are fixed; column **types are per‑engine** (below). JSON
columns hold arrays. `tools` is `NULL` to mean *all tools*, or a JSON array to
restrict. Booleans may be a native boolean or `0/1` per engine.

```
winreach_admins
  id            text  primary key
  username      text  unique not null
  password_hash text  not null
  created_at    text/timestamp not null

winreach_users
  id            text  primary key
  name          text  unique not null
  role          text  not null
  token_hash    text  unique not null
  token_enc     text  null
  tools         json/text null           -- null = all tools
  allow         json/text not null        -- JSON array
  deny          json/text not null        -- JSON array
  enabled       boolean/int not null default 1
  created_at    text/timestamp not null
  last_used_at  text/timestamp null

winreach_meta
  key           text primary key          -- e.g. "schema_version"
  value         text not null
```

Per‑engine types: **SQLite** `TEXT`/`INTEGER`; **PostgreSQL** `TEXT`/`JSONB`/
`BOOLEAN`/`TIMESTAMPTZ`; **MySQL** `VARCHAR(255)`/`JSON`/`TINYINT(1)`/`DATETIME`.

## Canonical schema (MongoDB)

Two collections, documents mirroring the fields above (camelCase or snake — the
adapter maps them). Required indexes:

```
db.winreach_admins.createIndex({ username: 1 }, { unique: true })
db.winreach_users.createIndex({ name: 1 }, { unique: true })
db.winreach_users.createIndex({ tokenHash: 1 }, { unique: true })
```

A `winreach_meta` collection holds `{ key, value }` docs (e.g. schema version).

## Using an existing table

If the target already has a `winreach_users` / `winreach_admins` table (or the
Mongo collections), the app validates that the **required** columns/fields are
present (see `REQUIRED_USER_FIELDS` / `REQUIRED_ADMIN_FIELDS` in
`lib/store/types.ts`). If any are missing it refuses to run and tells you which,
rather than altering your table. Extra columns are left untouched.

## For future agents — changing the schema safely

The schema is intentionally flexible. Follow these rules so changes stay safe:

1. **Additive only.** Add new **nullable** columns/fields with sensible defaults.
   Never rename/drop/retype an existing required column in a migration the app
   runs — that risks data loss. Do destructive changes yourself, deliberately.
2. **The required set is the contract.** `REQUIRED_USER_FIELDS` /
   `REQUIRED_ADMIN_FIELDS` in `lib/store/types.ts` define what the app depends
   on. Add a field to a backend freely; only add it to the required set if the
   app truly needs it, and bump `SCHEMA_VERSION`.
3. **Validate, don't mutate, existing tables.** `init()` creates missing objects
   and validates present ones; it must never `ALTER`/`DROP`. Keep it that way.
4. **Parameterized queries only.** Every backend must bind user input as
   parameters — never string‑concatenate SQL, and never build Mongo queries from
   raw user objects.
5. **Record the version.** Write `schema_version` into `winreach_meta` on init
   and read it back to detect drift.

### Adding a new database backend

Implement `AccountStore` from `lib/store/types.ts` in
`lib/store/<engine>.ts`, register it in the store factory, and add the driver as
an optional dependency loaded via dynamic `import()` (so unused drivers aren't
bundled). Encrypt/decrypt and hash with the helpers in `lib/store/crypto.ts` —
do not invent new crypto. Add the engine's column types to the table above.
