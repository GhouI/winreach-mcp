"use client";

// Thin root: the accounts panel now lives in ./accounts/. Kept here so existing
// importers of "@/components/accounts-panel" continue to work unchanged.
export { AccountsPanel } from "./accounts";
export type { Boot } from "./accounts";
