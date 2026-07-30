/**
 * OAuth 2.0 authentication for MCP server.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { OAuthConfig } from "./types.js";

/** Constant-time string comparison (hashes first to equalize lengths). */
function secureCompare(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export interface AuthResult {
  authorized: boolean;
  scopes?: string[];
  error?: string;
}

export class OAuthProvider {
  private config: OAuthConfig;

  constructor(config: OAuthConfig) {
    this.config = config;
  }

  /**
   * Validate a bearer token.
   * In production, this would verify a JWT signature.
   * For now, it checks if the token matches the configured secret.
   */
  validateToken(token: string): AuthResult {
    if (!this.config.required) {
      return { authorized: true };
    }

    if (!token) {
      return { authorized: false, error: "Missing token" };
    }

    // Simple token validation — in production, use proper JWT verification.
    // Constant-time comparison avoids leaking the secret via timing.
    if (this.config.jwtSecret && secureCompare(token, this.config.jwtSecret)) {
      return { authorized: true, scopes: this.config.scopes };
    }

    // Check Bearer prefix
    if (token.startsWith("Bearer ")) {
      const raw = token.slice(7);
      if (this.config.jwtSecret && secureCompare(raw, this.config.jwtSecret)) {
        return { authorized: true, scopes: this.config.scopes };
      }
    }

    return { authorized: false, error: "Invalid token" };
  }

  /**
   * Check if a token has a specific permission/scope.
   */
  checkPermission(token: string, requiredScope: string): AuthResult {
    const result = this.validateToken(token);
    if (!result.authorized) return result;

    // Auth disabled entirely — scope enforcement doesn't apply
    if (!this.config.required) return result;

    // Fail closed: a server configured without any scopes grants none.
    if (!this.config.scopes || !this.config.scopes.includes(requiredScope)) {
      return { authorized: false, error: `Missing scope: ${requiredScope}` };
    }

    return result;
  }
}
