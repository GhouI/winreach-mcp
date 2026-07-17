import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFileSync } from "node:fs";
import type { Express } from "express";

/**
 * TLS configuration. When present, WinReach terminates HTTPS itself instead of
 * relying on an external reverse proxy or tunnel for encryption. Supplying
 * `clientCaPath` additionally turns on mutual TLS: clients must present a
 * certificate signed by that CA or the connection is rejected during the
 * handshake, before any request reaches the bearer-token check.
 */
export type TlsConfig = {
  certPath: string;
  keyPath: string;
  passphrase?: string;
  /** PEM CA bundle used to verify client certificates. Enables mTLS when set. */
  clientCaPath?: string;
};

export type ServerScheme = "http" | "https";

function readPem(path: string, label: string): Buffer {
  try {
    return readFileSync(path);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read ${label} at ${path}: ${detail}`);
  }
}

/**
 * Translate our TlsConfig into Node's TLS options, reading the certificate,
 * key, and (for mTLS) client CA from disk. `requestCert` + `rejectUnauthorized`
 * enforce mutual TLS when a client CA is configured.
 */
export function buildTlsOptions(tls: TlsConfig): {
  cert: Buffer;
  key: Buffer;
  passphrase?: string;
  ca?: Buffer;
  requestCert: boolean;
  rejectUnauthorized: boolean;
} {
  const cert = readPem(tls.certPath, "WINREACH_TLS_CERT");
  const key = readPem(tls.keyPath, "WINREACH_TLS_KEY");
  const mtls = Boolean(tls.clientCaPath);
  const ca = tls.clientCaPath ? readPem(tls.clientCaPath, "WINREACH_TLS_CLIENT_CA") : undefined;

  return {
    cert,
    key,
    passphrase: tls.passphrase,
    ca,
    requestCert: mtls,
    rejectUnauthorized: mtls
  };
}

/**
 * Create the HTTP or HTTPS server that fronts the Express app. Returns the
 * server plus the scheme actually in use so callers can log the correct URL.
 */
export function createServerForApp(app: Express, tls?: TlsConfig): { server: HttpServer; scheme: ServerScheme } {
  if (!tls) {
    return { server: createHttpServer(app), scheme: "http" };
  }

  return { server: createHttpsServer(buildTlsOptions(tls), app), scheme: "https" };
}
