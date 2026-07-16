import { describe, expect, it } from "vitest";
import {
  assertUniqueTokens,
  createPrimaryPrincipal,
  parsePrincipals,
  resolvePrincipal
} from "../src/principals.js";

describe("parsePrincipals", () => {
  it("parses inline tokens with name, role, and policy", () => {
    const principals = parsePrincipals(
      JSON.stringify([{ name: "alice", role: "readonly", token: "tok-a", allow: ["^Get-"], deny: ["Remove-Item"] }]),
      {}
    );
    expect(principals).toHaveLength(1);
    expect(principals[0].name).toBe("alice");
    expect(principals[0].role).toBe("readonly");
    expect(principals[0].token).toBe("tok-a");
    expect(principals[0].policy.allow[0].test("Get-Item")).toBe(true);
    expect(principals[0].policy.deny[0].test("Remove-Item x")).toBe(true);
  });

  it("resolves a token from an env var via tokenEnv", () => {
    const principals = parsePrincipals(
      JSON.stringify([{ name: "bob", tokenEnv: "BOB_TOKEN" }]),
      { BOB_TOKEN: "from-env" }
    );
    expect(principals[0].token).toBe("from-env");
    expect(principals[0].role).toBe("user");
  });

  it("defaults name and role when omitted", () => {
    const principals = parsePrincipals(JSON.stringify([{ token: "t1" }]), {});
    expect(principals[0].name).toBe("principal-1");
    expect(principals[0].role).toBe("user");
  });

  it("rejects invalid JSON", () => {
    expect(() => parsePrincipals("not json", {})).toThrow(/valid JSON/);
  });

  it("rejects an empty array", () => {
    expect(() => parsePrincipals("[]", {})).toThrow(/non-empty/);
  });

  it("rejects an entry with no token", () => {
    expect(() => parsePrincipals(JSON.stringify([{ name: "x" }]), {})).toThrow(/token/);
  });

  it("rejects a tokenEnv pointing at an empty variable", () => {
    expect(() => parsePrincipals(JSON.stringify([{ tokenEnv: "MISSING" }]), {})).toThrow(/empty env var/);
  });
});

describe("resolvePrincipal", () => {
  const principals = [
    createPrimaryPrincipal("admin-token", { allow: [], deny: [] }),
    ...parsePrincipals(JSON.stringify([{ name: "alice", token: "alice-token" }]), {})
  ];

  it("resolves the matching principal", () => {
    expect(resolvePrincipal(principals, "admin-token")?.name).toBe("default");
    expect(resolvePrincipal(principals, "alice-token")?.name).toBe("alice");
  });

  it("returns undefined for an unknown token", () => {
    expect(resolvePrincipal(principals, "nope")).toBeUndefined();
  });

  it("does not match on a prefix", () => {
    expect(resolvePrincipal(principals, "admin")).toBeUndefined();
  });
});

describe("assertUniqueTokens", () => {
  it("passes for distinct tokens", () => {
    expect(() =>
      assertUniqueTokens([
        createPrimaryPrincipal("a", { allow: [], deny: [] }),
        createPrimaryPrincipal("b", { allow: [], deny: [] })
      ])
    ).not.toThrow();
  });

  it("throws when two principals share a token", () => {
    expect(() =>
      assertUniqueTokens([
        createPrimaryPrincipal("dup", { allow: [], deny: [] }),
        { name: "alice", role: "user", token: "dup", policy: { allow: [], deny: [] } }
      ])
    ).toThrow(/Duplicate principal token/);
  });
});
