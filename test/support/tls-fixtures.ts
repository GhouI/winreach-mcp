import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Paths to a self-signed server certificate, a client CA, and a client
 * certificate signed by that CA. Generated at test time so no private key is
 * ever committed to the repository.
 */
export type TlsFixtures = {
  serverCert: string;
  serverKey: string;
  clientCaCert: string;
  clientCert: string;
  clientKey: string;
};

let cache: TlsFixtures | null | undefined;

function opensslAvailable(): boolean {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure TLS test fixtures exist and return their paths, or `null` when openssl
 * is not available so callers can skip TLS-dependent tests. Fixtures are
 * generated once per worker process into a temp directory. Args are passed to
 * openssl directly (no shell), so `/CN=...` subjects need no escaping.
 */
export function ensureTlsFixtures(): TlsFixtures | null {
  if (cache !== undefined) {
    return cache;
  }
  if (!opensslAvailable()) {
    cache = null;
    return cache;
  }

  const dir = join(tmpdir(), `winreach-tls-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const f = (name: string) => join(dir, name);

  const fixtures: TlsFixtures = {
    serverCert: f("server-cert.pem"),
    serverKey: f("server-key.pem"),
    clientCaCert: f("client-ca-cert.pem"),
    clientCert: f("client-cert.pem"),
    clientKey: f("client-key.pem")
  };

  if (!existsSync(fixtures.serverCert)) {
    const caKey = f("client-ca-key.pem");
    const csr = f("client.csr");
    const run = (args: string[]) => execFileSync("openssl", args, { cwd: dir, stdio: "ignore" });

    // Server self-signed cert valid for localhost / 127.0.0.1.
    run([
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", fixtures.serverKey, "-out", fixtures.serverCert,
      "-days", "3650", "-subj", "/CN=localhost",
      "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"
    ]);
    // Client CA.
    run([
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", caKey, "-out", fixtures.clientCaCert,
      "-days", "3650", "-subj", "/CN=WinReach Test Client CA"
    ]);
    // Client cert signed by the client CA.
    run([
      "req", "-newkey", "rsa:2048", "-nodes",
      "-keyout", fixtures.clientKey, "-out", csr,
      "-subj", "/CN=winreach-test-client"
    ]);
    run([
      "x509", "-req", "-in", csr,
      "-CA", fixtures.clientCaCert, "-CAkey", caKey, "-CAcreateserial",
      "-out", fixtures.clientCert, "-days", "3650"
    ]);
  }

  cache = fixtures;
  return cache;
}
