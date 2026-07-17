import { describe, expect, it } from "vitest";
import { parseRoles } from "../src/roles.js";
import { parsePrincipals } from "../src/principals.js";

describe("parseRoles", () => {
  it("parses a role's tools and command policy", () => {
    const roles = parseRoles(
      JSON.stringify({
        deployer: { tools: ["powershell_execute", "file_upload"], allow: ["^Get-"], deny: ["Remove-Item"] }
      })
    );
    const deployer = roles.get("deployer");
    expect(deployer?.tools).toEqual(["powershell_execute", "file_upload"]);
    expect(deployer?.policy.allow[0].test("Get-Item")).toBe(true);
    expect(deployer?.policy.deny[0].test("Remove-Item x")).toBe(true);
  });

  it("leaves tools undefined (all tools) when a role omits them", () => {
    const roles = parseRoles(JSON.stringify({ operator: { deny: ["Format-Volume"] } }));
    expect(roles.get("operator")?.tools).toBeUndefined();
    expect(roles.get("operator")?.policy.deny[0].test("Format-Volume")).toBe(true);
  });

  it("rejects non-object JSON", () => {
    expect(() => parseRoles("[]")).toThrow(/must be a JSON object/);
    expect(() => parseRoles("not json")).toThrow(/valid JSON/);
  });

  it("rejects a role that is not an object", () => {
    expect(() => parseRoles(JSON.stringify({ bad: "nope" }))).toThrow(/must be an object/);
  });

  it("rejects a non-string tool list and invalid regex", () => {
    expect(() => parseRoles(JSON.stringify({ r: { tools: [1] } }))).toThrow(/must be an array of strings/);
    expect(() => parseRoles(JSON.stringify({ r: { allow: ["("] } }))).toThrow(/Invalid/);
  });
});

describe("parsePrincipals with roles", () => {
  const roles = parseRoles(
    JSON.stringify({
      deployer: { tools: ["powershell_execute", "file_upload"], allow: ["^Get-", "^Copy-Item"], deny: ["Remove-Item"] },
      auditor: { tools: ["powershell_execute"], allow: ["^Get-", "^Test-"] }
    })
  );

  it("inherits the role's tools and policy when the principal omits them", () => {
    const [p] = parsePrincipals(
      JSON.stringify([{ name: "bob", role: "deployer", token: "t-bob" }]),
      {},
      roles
    );
    expect(p.tools).toEqual(["powershell_execute", "file_upload"]);
    expect(p.policy.allow.some((r) => r.test("Copy-Item x"))).toBe(true);
    expect(p.policy.deny.some((r) => r.test("Remove-Item x"))).toBe(true);
  });

  it("lets the principal override a single field while inheriting the rest", () => {
    const [p] = parsePrincipals(
      JSON.stringify([{ name: "carol", role: "deployer", token: "t-carol", tools: ["powershell_execute"] }]),
      {},
      roles
    );
    // tools overridden…
    expect(p.tools).toEqual(["powershell_execute"]);
    // …but allow/deny still inherited from the role.
    expect(p.policy.allow.some((r) => r.test("Get-Item"))).toBe(true);
    expect(p.policy.deny.some((r) => r.test("Remove-Item"))).toBe(true);
  });

  it("an explicit empty tools list overrides the role (no tools), not inherits", () => {
    const [p] = parsePrincipals(
      JSON.stringify([{ name: "none", role: "deployer", token: "t-none", tools: [] }]),
      {},
      roles
    );
    expect(p.tools).toEqual([]);
  });

  it("treats an unknown role name as a plain label (no inheritance)", () => {
    const [p] = parsePrincipals(
      JSON.stringify([{ name: "x", role: "does-not-exist", token: "t-x" }]),
      {},
      roles
    );
    expect(p.role).toBe("does-not-exist");
    expect(p.tools).toBeUndefined();
    expect(p.policy.allow).toEqual([]);
    expect(p.policy.deny).toEqual([]);
  });

  it("works unchanged when no roles map is supplied", () => {
    const [p] = parsePrincipals(
      JSON.stringify([{ name: "y", role: "deployer", token: "t-y" }]),
      {}
    );
    expect(p.tools).toBeUndefined();
    expect(p.policy.allow).toEqual([]);
  });
});
