/**
 * OIDC Authorization Helper Utilities
 *
 * Provides validation functions for the authorization endpoint:
 * - validateAuthRequest: validates client_id, redirect_uri, response_type, scope
 * - validatePKCE: validates PKCE parameters for public clients
 * - parseScopes: parses space-separated scope string into array
 * - isScopeSubset: checks if granted scopes cover all requested scopes
 *
 * Requirements: 3.1, 3.2, 4.5, 8.3
 */

import dbConnect from "@/lib/mongodb";
import OAuthClient from "@/lib/models/OAuthClient";

/**
 * Parse a space-separated scope string into an array of unique scope values.
 * @param {string} scopeString - Space-separated scope string (e.g. "openid profile email")
 * @returns {string[]} Array of scope strings
 */
export function parseScopes(scopeString) {
  if (!scopeString || typeof scopeString !== "string") {
    return [];
  }
  return [...new Set(scopeString.trim().split(/\s+/).filter(Boolean))];
}

/**
 * Check if granted scopes cover all requested scopes.
 * Used for consent skip check — if user previously granted a superset,
 * no new consent is needed.
 *
 * @param {string[]} grantedScopes - Scopes previously granted by the user
 * @param {string[]} requestedScopes - Scopes being requested in current authorization
 * @returns {boolean} True if granted scopes include all requested scopes
 */
export function isScopeSubset(grantedScopes, requestedScopes) {
  if (!Array.isArray(grantedScopes) || !Array.isArray(requestedScopes)) {
    return false;
  }
  if (requestedScopes.length === 0) {
    return true;
  }
  const grantedSet = new Set(grantedScopes);
  return requestedScopes.every((scope) => grantedSet.has(scope));
}

/**
 * Validate an authorization request's parameters.
 *
 * Checks:
 * - client_id exists in OAuthClient collection and is active
 * - redirect_uri matches one of the registered URIs for the client
 * - response_type === "code"
 * - scope includes "openid"
 *
 * @param {object} params - Authorization request parameters
 * @param {string} params.client_id - The client identifier
 * @param {string} params.redirect_uri - The redirect URI
 * @param {string} params.response_type - Must be "code"
 * @param {string} params.scope - Space-separated scope string
 * @returns {Promise<{valid: boolean, client?: object, error?: string, error_description?: string}>}
 */
export async function validateAuthRequest(params) {
  const { client_id, redirect_uri, response_type, scope } = params || {};

  // Validate required parameters are present
  if (!client_id) {
    return {
      valid: false,
      error: "invalid_request",
      error_description: "Missing required parameter: client_id",
    };
  }

  if (!redirect_uri) {
    return {
      valid: false,
      error: "invalid_request",
      error_description: "Missing required parameter: redirect_uri",
    };
  }

  if (!response_type) {
    return {
      valid: false,
      error: "invalid_request",
      error_description: "Missing required parameter: response_type",
    };
  }

  if (!scope) {
    return {
      valid: false,
      error: "invalid_request",
      error_description: "Missing required parameter: scope",
    };
  }

  // Validate response_type is "code" (only supported flow)
  if (response_type !== "code") {
    return {
      valid: false,
      error: "unsupported_response_type",
      error_description: "Only response_type=code is supported",
    };
  }

  // Validate openid scope is present (required for OIDC)
  const scopes = parseScopes(scope);
  if (!scopes.includes("openid")) {
    return {
      valid: false,
      error: "invalid_scope",
      error_description: "The openid scope is required",
    };
  }

  // Look up client in database
  await dbConnect();
  const client = await OAuthClient.findOne({ client_id });

  if (!client) {
    return {
      valid: false,
      error: "unauthorized_client",
      error_description: "Unknown client_id",
    };
  }

  if (!client.active) {
    return {
      valid: false,
      error: "unauthorized_client",
      error_description: "Client is not active",
    };
  }

  // Validate redirect_uri matches a registered URI
  if (!client.redirect_uris.includes(redirect_uri)) {
    return {
      valid: false,
      error: "invalid_request",
      error_description: "redirect_uri does not match any registered URI for this client",
    };
  }

  // Validate requested scopes are within client's allowed scopes
  const disallowedScopes = scopes.filter(
    (s) => !client.allowed_scopes.includes(s)
  );
  if (disallowedScopes.length > 0) {
    return {
      valid: false,
      error: "invalid_scope",
      error_description: `Scope(s) not allowed for this client: ${disallowedScopes.join(", ")}`,
    };
  }

  return { valid: true, client };
}

/**
 * Validate PKCE parameters for the authorization request.
 *
 * For public clients, PKCE is required (code_challenge and code_challenge_method must be present).
 * For confidential clients, PKCE is optional but validated if provided.
 * Only S256 challenge method is supported.
 *
 * @param {object} params - Authorization request parameters
 * @param {string} [params.code_challenge] - The PKCE code challenge
 * @param {string} [params.code_challenge_method] - The challenge method (must be "S256")
 * @param {string} clientType - "public" or "confidential"
 * @returns {{valid: boolean, error?: string, error_description?: string}}
 */
export function validatePKCE(params, clientType) {
  const { code_challenge, code_challenge_method } = params || {};

  // For public clients, PKCE is required
  if (clientType === "public") {
    if (!code_challenge) {
      return {
        valid: false,
        error: "invalid_request",
        error_description: "PKCE code_challenge is required for public clients",
      };
    }
    if (!code_challenge_method) {
      return {
        valid: false,
        error: "invalid_request",
        error_description: "PKCE code_challenge_method is required for public clients",
      };
    }
  }

  // If PKCE parameters are provided, validate them
  if (code_challenge || code_challenge_method) {
    if (!code_challenge) {
      return {
        valid: false,
        error: "invalid_request",
        error_description: "code_challenge_method provided without code_challenge",
      };
    }
    if (!code_challenge_method) {
      return {
        valid: false,
        error: "invalid_request",
        error_description: "code_challenge provided without code_challenge_method",
      };
    }
    // Only S256 is supported (plain is deprecated per OAuth 2.1)
    if (code_challenge_method !== "S256") {
      return {
        valid: false,
        error: "invalid_request",
        error_description: "Only code_challenge_method=S256 is supported",
      };
    }
  }

  return { valid: true };
}
