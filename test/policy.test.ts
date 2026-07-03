import { describe, expect, it } from "vitest";
import {
  compilePatterns,
  evaluatePolicies,
  evaluatePolicy,
  isUnrestricted,
  type CommandPolicy
} from "../src/policy.js";

function policy(allow: string[], deny: string[]): CommandPolicy {
  return {
    allow: compilePatterns(allow, "allow"),
    deny: compilePatterns(deny, "deny")
  };
}

describe("compilePatterns", () => {
  it("compiles case-insensitive regexes", () => {
    const [re] = compilePatterns(["remove-item"], "deny");
    expect(re.test("REMOVE-ITEM C:\\temp")).toBe(true);
  });

  it("throws on an invalid pattern with context", () => {
    expect(() => compilePatterns(["("], "deny")).toThrow(/Invalid deny pattern/);
  });
});

describe("evaluatePolicy", () => {
  it("allows everything when unrestricted", () => {
    expect(evaluatePolicy(policy([], []), "Get-Process", "global").allowed).toBe(true);
  });

  it("blocks a denied command (deny wins)", () => {
    const decision = evaluatePolicy(policy([".*"], ["Remove-Item"]), "Remove-Item x", "global");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("denylist");
    expect(decision.matchedRule).toBe("global:Remove-Item");
  });

  it("blocks a command not on a non-empty allowlist", () => {
    const decision = evaluatePolicy(policy(["^Get-"], []), "Set-Content x", "global");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("allowlist");
  });

  it("permits a command that matches the allowlist", () => {
    expect(evaluatePolicy(policy(["^Get-"], []), "Get-ChildItem", "global").allowed).toBe(true);
  });

  it("deny takes precedence over a matching allow", () => {
    const decision = evaluatePolicy(policy(["^Get-"], ["Get-Secret"]), "Get-Secret vault", "global");
    expect(decision.allowed).toBe(false);
  });
});

describe("evaluatePolicies", () => {
  const global = policy([], ["format-volume"]);
  const restricted = policy(["^Get-"], []);

  it("passes only when every policy permits", () => {
    expect(evaluatePolicies("Get-Item x", [
      { source: "global", policy: global },
      { source: "alice", policy: restricted }
    ]).allowed).toBe(true);
  });

  it("is rejected by the global policy", () => {
    const decision = evaluatePolicies("Format-Volume C", [
      { source: "global", policy: global },
      { source: "alice", policy: restricted }
    ]);
    expect(decision.allowed).toBe(false);
    expect(decision.matchedRule).toContain("global");
  });

  it("is rejected by the principal policy even when global allows", () => {
    const decision = evaluatePolicies("Set-Content x", [
      { source: "global", policy: global },
      { source: "alice", policy: restricted }
    ]);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("alice");
  });
});

describe("isUnrestricted", () => {
  it("is true for an empty policy and false otherwise", () => {
    expect(isUnrestricted(policy([], []))).toBe(true);
    expect(isUnrestricted(policy([], ["x"]))).toBe(false);
  });
});
