import { timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { resolvePrincipal, type Principal } from "./principals.js";

/** Constant-time string comparison that does not short-circuit on the first byte. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return undefined;
  }

  return token;
}

export function isAuthorized(header: string | undefined, expectedToken: string): boolean {
  const token = extractBearerToken(header);
  if (token === undefined) {
    return false;
  }
  return safeEqual(token, expectedToken);
}

export function createBearerAuthMiddleware(expectedToken: string): RequestHandler {
  return (req: Request, res: Response, next) => {
    if (!isAuthorized(req.header("authorization"), expectedToken)) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Missing or invalid bearer token"
        },
        id: null
      });
      return;
    }

    next();
  };
}

/**
 * Bearer-auth middleware for multi-principal deployments. Resolves the bearer
 * token to a known principal and stashes it on `res.locals.principal` for the
 * request handler; rejects with 401 when the token matches no principal.
 */
export function createPrincipalAuthMiddleware(principals: Principal[]): RequestHandler {
  return (req: Request, res: Response, next) => {
    const token = extractBearerToken(req.header("authorization"));
    const principal = token === undefined ? undefined : resolvePrincipal(principals, token);
    if (!principal) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Missing or invalid bearer token"
        },
        id: null
      });
      return;
    }

    res.locals.principal = principal;
    next();
  };
}

/** Read the principal attached by createPrincipalAuthMiddleware, if any. */
export function getRequestPrincipal(res: Response): Principal | undefined {
  return res.locals.principal as Principal | undefined;
}

export function createOriginGuard(allowedOrigins: string[]): RequestHandler {
  return (req: Request, res: Response, next) => {
    const origin = req.header("origin");
    if (origin && allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
      res.status(403).json({
        jsonrpc: "2.0",
        error: {
          code: -32002,
          message: "Origin is not allowed"
        },
        id: null
      });
      return;
    }

    next();
  };
}
