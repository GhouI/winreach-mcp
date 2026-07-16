// `pg` ships no bundled types and we don't add @types/pg (the adapter uses its
// own minimal structural types and dynamic import). Declare the module so the
// dynamic import type-checks; the real shape is asserted in postgres.ts.
declare module "pg";
