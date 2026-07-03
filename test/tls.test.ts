import express from "express";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTlsOptions, createServerForApp, type TlsConfig } from "../src/tls.js";
import { ensureTlsFixtures } from "./support/tls-fixtures.js";

const fixtures = ensureTlsFixtures();
const describeTls = fixtures ? describe : describe.skip;

const serverTls: TlsConfig = {
  certPath: fixtures?.serverCert ?? "",
  keyPath: fixtures?.serverKey ?? ""
};

const mtls: TlsConfig = {
  ...serverTls,
  clientCaPath: fixtures?.clientCaCert
};

describeTls("buildTlsOptions", () => {
  it("reads cert and key and leaves mTLS off by default", () => {
    const options = buildTlsOptions(serverTls);
    expect(options.cert.toString()).toContain("BEGIN CERTIFICATE");
    expect(options.key.toString()).toContain("PRIVATE KEY");
    expect(options.requestCert).toBe(false);
    expect(options.rejectUnauthorized).toBe(false);
    expect(options.ca).toBeUndefined();
  });

  it("enables mTLS enforcement when a client CA is supplied", () => {
    const options = buildTlsOptions(mtls);
    expect(options.ca?.toString()).toContain("BEGIN CERTIFICATE");
    expect(options.requestCert).toBe(true);
    expect(options.rejectUnauthorized).toBe(true);
  });

  it("throws a helpful error when a file is missing", () => {
    expect(() =>
      buildTlsOptions({ certPath: join(process.cwd(), "does-not-exist.pem"), keyPath: serverTls.keyPath })
    ).toThrow(/WINBRIDGE_TLS_CERT/);
  });
});

describe("createServerForApp", () => {
  it("returns a plain HTTP server when no TLS is configured", () => {
    const { server, scheme } = createServerForApp(express(), undefined);
    expect(scheme).toBe("http");
    server.close();
  });
});

describeTls("createServerForApp with TLS", () => {
  it("returns an HTTPS server when TLS is configured", () => {
    const { server, scheme } = createServerForApp(express(), serverTls);
    expect(scheme).toBe("https");
    server.close();
  });
});
