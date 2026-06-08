# Implementation Plan: OIDC Identity Provider (SSO Login)

## Overview

Transform the Mailbox application into a fully compliant OpenID Connect Identity Provider. This implementation adds OIDC protocol endpoints, RSA key management, OAuth client registration, consent management, and token lifecycle to the existing Next.js app with NextAuth.js authentication and MongoDB/Mongoose.

## Tasks

- [ ] 1. RSA Key Management and Environment Configuration
  - [ ] 1.1 Create RSA key pair generation script and key loading utility
    - Create `scripts/generate-rsa-keys.js` that generates a 2048-bit RSA key pair and outputs base64-encoded PEM values for environment variables
    - Create `lib/oidc/keys.js` utility that loads RSA keys from environment variables (OIDC_RSA_PRIVATE_KEY, OIDC_RSA_PUBLIC_KEY), parses PEM format, and exports key objects for signing and verification
    - Export a `getJWKS()` function that returns the public key in JWK format (with kid, kty, n, e, alg, use fields)
    - Add OIDC_ISSUER_URL environment variable for the canonical issuer value
    - _Requirements: 10.7, 1.3, 1.4_

  - [ ] 1.2 Add OIDC environment variables to configuration
    - Add OIDC_RSA_PRIVATE_KEY, OIDC_RSA_PUBLIC_KEY, and OIDC_ISSUER_URL to `.env.local` with placeholder values
    - Document required environment variables in a comment block
    - _Requirements: 1.4, 10.7_

- [ ] 2. Database Models for OIDC
  - [ ] 2.1 Create OAuthClient Mongoose model
    - Create `lib/models/OAuthClient.js` with fields: client_id (unique, indexed), client_secret_hash, client_type (enum: public, confidential), display_name, redirect_uris (array of strings), allowed_scopes (array of strings), active (boolean, default true), createdAt, updatedAt
    - Add unique index on client_id
    - _Requirements: 2.1, 2.2_

  - [ ] 2.2 Create AuthorizationCode Mongoose model
    - Create `lib/models/AuthorizationCode.js` with fields: code (unique, indexed), client_id, user_id (ObjectId ref to User), redirect_uri, scopes (array), state, nonce, code_challenge, code_challenge_method, used (boolean, default false), expiresAt (Date, TTL index for auto-cleanup)
    - Set TTL index on expiresAt for automatic expiry after 60 seconds
    - _Requirements: 3.5, 3.7, 4.1_

  - [ ] 2.3 Create OIDCToken Mongoose model
    - Create `lib/models/OIDCToken.js` with fields: token_hash (indexed), token_type (enum: access_token, refresh_token), client_id, user_id (ObjectId ref to User), scopes (array), revoked (boolean, default false), parent_refresh_token (string, nullable), expiresAt (Date), createdAt
    - Add indexes on token_hash, client_id + user_id combination, and parent_refresh_token
    - _Requirements: 5.4, 5.6, 10.5_

  - [ ] 2.4 Create UserConsent Mongoose model
    - Create `lib/models/UserConsent.js` with fields: user_id (ObjectId ref to User), client_id, granted_scopes (array of strings), granted_at (Date)
    - Add unique compound index on user_id + client_id
    - _Requirements: 7.5, 7.2_

- [ ] 3. OIDC Discovery Endpoints
  - [ ] 3.1 Implement /.well-known/openid-configuration endpoint
    - Create `app/.well-known/openid-configuration/route.js` as a Next.js route handler
    - Return JSON document with: issuer (from OIDC_ISSUER_URL env var), authorization_endpoint, token_endpoint, userinfo_endpoint, jwks_uri, revocation_endpoint, response_types_supported (["code"]), subject_types_supported (["public"]), id_token_signing_alg_values_supported (["RS256"]), scopes_supported (["openid", "profile", "email", "offline_access"]), token_endpoint_auth_methods_supported (["client_secret_basic", "client_secret_post"])
    - Set Content-Type to application/json and appropriate CORS headers
    - _Requirements: 1.1, 1.2, 1.4, 10.2_

  - [ ] 3.2 Implement /.well-known/jwks.json endpoint
    - Create `app/.well-known/jwks.json/route.js` as a Next.js route handler
    - Return the public RSA key in JWKS format using the getJWKS() utility from lib/oidc/keys.js
    - Set Content-Type to application/json and CORS headers
    - _Requirements: 1.3, 10.2_

- [ ] 4. Authorization Endpoint
  - [ ] 4.1 Create OIDC authorization helper utilities
    - Create `lib/oidc/authorize.js` with functions for: validating authorization request parameters (client_id, redirect_uri, response_type, scope), checking if openid scope is present, validating PKCE parameters for public clients
    - _Requirements: 3.1, 3.2, 4.5, 8.3_

  - [ ] 4.2 Implement /api/oidc/authorize route handler
    - Create `app/api/oidc/authorize/route.js` handling GET and POST requests
    - Validate client_id exists and is active, validate redirect_uri matches registered URIs
    - If validation fails, display error page (do NOT redirect to unregistered URI)
    - Check for active NextAuth.js session using getServerSession
    - If not authenticated, redirect to login page with return URL preserving all OIDC params (client_id, redirect_uri, scope, state, nonce, code_challenge, code_challenge_method)
    - If authenticated, check UserConsent for existing consent covering requested scopes
    - If consent exists (same or superset of scopes), generate AuthorizationCode and redirect
    - If no consent or additional scopes needed, redirect to consent screen page
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 7.2, 7.3, 11.1, 11.2, 11.3_

  - [ ] 4.3 Implement authorization code generation utility
    - Create `lib/oidc/code.js` with function to generate cryptographically random authorization code
    - Store code in AuthorizationCode model with 60-second expiry, bound to client_id, redirect_uri, user_id, scopes, nonce, and PKCE code_challenge
    - _Requirements: 3.5, 3.7, 4.1_

- [ ] 5. Consent Screen UI
  - [ ] 5.1 Create consent screen page
    - Create `app/oidc/consent/page.js` as a client component
    - Display the Relying Party's display_name, list of requested scopes with human-readable descriptions (openid: "Verify your identity", profile: "Access your name", email: "Access your email address", offline_access: "Maintain access when you're not present")
    - Include Approve and Deny buttons
    - On approve: POST to /api/oidc/authorize/consent with the authorization parameters
    - On deny: redirect to redirect_uri with error=access_denied and state parameter
    - _Requirements: 7.1, 3.6_

  - [ ] 5.2 Implement /api/oidc/authorize/consent route handler
    - Create `app/api/oidc/authorize/consent/route.js` handling POST
    - Verify active session, validate authorization parameters again
    - Save or update UserConsent record with granted scopes and timestamp
    - Generate AuthorizationCode and redirect to redirect_uri with code and state
    - _Requirements: 3.5, 7.5, 7.2_

- [ ] 6. Checkpoint - Core authorization flow complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Token Endpoint
  - [ ] 7.1 Implement client authentication utility
    - Create `lib/oidc/client-auth.js` with functions to: extract client credentials from Authorization header (Basic auth) or request body (POST params), verify client_secret against stored bcrypt hash, validate client_id exists and is active
    - _Requirements: 5.2, 10.3, 10.4_

  - [ ] 7.2 Implement /api/oidc/token route handler for authorization_code grant
    - Create `app/api/oidc/token/route.js` handling POST requests
    - Validate grant_type is authorization_code or refresh_token
    - For authorization_code: validate code exists, not expired, not used, redirect_uri matches, client authenticated
    - For confidential clients: require client_secret authentication
    - For public clients: require PKCE code_verifier and verify BASE64URL(SHA256(code_verifier)) matches stored code_challenge
    - Mark authorization code as used after successful exchange (single-use enforcement)
    - If code already used or expired, return error=invalid_grant
    - If client credentials invalid, return HTTP 401 with error=invalid_client
    - _Requirements: 5.1, 5.2, 5.3, 5.8, 5.9, 5.10, 4.3, 4.4_

  - [ ] 7.3 Implement ID token generation
    - Create `lib/oidc/tokens.js` with function to generate signed ID tokens (RS256)
    - Include claims: iss (from OIDC_ISSUER_URL), sub (user MongoDB _id), aud (client_id), exp, iat, nonce (if provided), plus scope-dependent claims (email, name, email_verified)
    - Sign using the private RSA key from lib/oidc/keys.js
    - Use jsonwebtoken library for JWT signing
    - _Requirements: 5.5, 8.2, 8.4, 10.7_

  - [ ] 7.4 Implement access token and refresh token generation
    - Generate opaque access tokens (cryptographically random strings), store hash in OIDCToken model with 3600s lifetime
    - Generate refresh tokens for confidential clients only (when offline_access scope granted), store hash in OIDCToken model with 2592000s (30 day) lifetime
    - Return JSON response with id_token, access_token, token_type=Bearer, expires_in=3600, and refresh_token (if applicable)
    - _Requirements: 5.4, 5.6, 8.1_

  - [ ] 7.5 Implement refresh token grant flow
    - Handle grant_type=refresh_token in the token endpoint
    - Validate refresh token exists, not revoked, not expired, matches client_id
    - Issue new access token and rotate refresh token (invalidate old, issue new)
    - If a previously invalidated refresh token is presented, revoke ALL tokens for that client-user pair (security precaution)
    - _Requirements: 5.7, 10.5, 10.6_

  - [ ]* 7.6 Write unit tests for token endpoint
    - Test authorization_code exchange success flow
    - Test PKCE verification (valid and invalid code_verifier)
    - Test expired/used code rejection
    - Test invalid client credentials (HTTP 401)
    - Test refresh token rotation
    - Test revoked refresh token triggers full revocation
    - _Requirements: 5.1, 5.8, 5.9, 4.3, 4.4, 10.5, 10.6_

- [ ] 8. UserInfo Endpoint
  - [ ] 8.1 Implement /api/oidc/userinfo route handler
    - Create `app/api/oidc/userinfo/route.js` handling GET and POST requests
    - Extract Bearer token from Authorization header
    - Validate access token (lookup hash in OIDCToken model, check not revoked, not expired)
    - Return claims based on granted scopes: sub (always with openid), name (with profile), email + email_verified (with email)
    - If token missing/invalid/expired, return HTTP 401 with WWW-Authenticate: Bearer header
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 9. Token Revocation Endpoint
  - [ ] 9.1 Implement /api/oidc/revoke route handler
    - Create `app/api/oidc/revoke/route.js` handling POST requests
    - Require client authentication (client_id + client_secret)
    - Accept token and token_type_hint parameters
    - If token_type_hint is refresh_token, find and revoke the refresh token and all access tokens issued from it
    - If token_type_hint is access_token, find and revoke the access token
    - Always return HTTP 200 regardless of whether token was valid (prevent token probing)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ] 10. Checkpoint - Token lifecycle complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Rate Limiting and Security Middleware
  - [ ] 11.1 Implement rate limiting for token endpoint
    - Create `lib/oidc/rate-limit.js` with in-memory rate limiter (or use existing rate limiting if available)
    - Enforce 20 requests per minute per client_id on the token endpoint
    - Return HTTP 429 Too Many Requests when limit exceeded
    - _Requirements: 10.1_

  - [ ] 11.2 Implement CORS configuration for OIDC endpoints
    - Add CORS headers to discovery, JWKS, and token endpoints
    - Allow cross-origin requests from registered redirect_uri origins for the token endpoint
    - Discovery and JWKS endpoints allow all origins (public metadata)
    - _Requirements: 10.2_

- [ ] 12. Admin Panel - OAuth Client Management
  - [ ] 12.1 Create admin OAuth clients API routes
    - Create `app/api/admin/oauth-clients/route.js` with GET (list all clients with active authorization counts) and POST (create new client - generate client_id, hash client_secret with bcrypt, store record)
    - Display client_secret only once in the creation response
    - Require admin role authentication
    - _Requirements: 2.1, 2.5, 9.1, 9.5, 10.4_

  - [ ] 12.2 Create admin OAuth client detail/update/delete API routes
    - Create `app/api/admin/oauth-clients/[id]/route.js` with GET (detail with consent count), PATCH (update display_name, redirect_uris, allowed_scopes, active status), DELETE (mark inactive + revoke all tokens)
    - Require admin role authentication
    - _Requirements: 2.3, 2.4, 2.5, 9.2_

  - [ ] 12.3 Create admin OAuth client secret regeneration route
    - Create `app/api/admin/oauth-clients/[id]/regenerate-secret/route.js` with POST
    - Generate new client_secret, hash and store, invalidate previous secret
    - Return new secret in response (display once)
    - Require admin role authentication
    - _Requirements: 9.3_

  - [ ] 12.4 Create admin active authorizations API route
    - Create `app/api/admin/oauth-clients/authorizations/route.js` with GET (list all user-client consent records with user info) and DELETE (revoke specific authorization, invalidate all tokens for that pair)
    - Require admin role authentication
    - _Requirements: 9.4, 7.4_

  - [ ] 12.5 Create admin OAuth clients management UI page
    - Create `app/admin/oauth-clients/page.js` with a table listing all OAuth clients (display_name, client_id, status, active authorizations count, creation date)
    - Include "Register New Client" button/form, edit/delete actions per row, regenerate secret button
    - Include active authorizations view with revoke capability
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 13. User Consent Dashboard
  - [ ] 13.1 Create user authorized applications API and UI
    - Create `app/api/user/authorized-apps/route.js` with GET (list apps user has consented to) and DELETE (revoke consent for a specific client, invalidate all tokens)
    - Add authorized applications section to user settings/dashboard page showing app name, granted scopes, and granted date with revoke button
    - _Requirements: 7.4, 7.5_

- [ ] 14. Session Integration for OIDC Flow
  - [ ] 14.1 Implement login redirect with OIDC flow preservation
    - Modify the authorization endpoint to build a login redirect URL that encodes all OIDC parameters (client_id, redirect_uri, scope, state, nonce, code_challenge, code_challenge_method) as query params in a return URL
    - After successful NextAuth login, redirect back to the authorization endpoint with preserved parameters to resume the flow
    - _Requirements: 11.2, 11.3_

- [ ] 15. Final Checkpoint - Full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- The implementation uses JavaScript (not TypeScript) consistent with the existing codebase
- RSA keys are stored as base64-encoded PEM strings in environment variables
- Client secrets are bcrypt-hashed and never stored in plain text
- The existing NextAuth.js session system is leveraged for authentication state in the OIDC flow
- jsonwebtoken library is used for JWT signing (RS256)
- All token values stored in the database are hashed for security

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "2.2", "2.3", "2.4"] },
    { "id": 1, "tasks": ["3.1", "3.2", "4.1"] },
    { "id": 2, "tasks": ["4.2", "4.3", "7.1"] },
    { "id": 3, "tasks": ["5.1", "5.2", "7.3"] },
    { "id": 4, "tasks": ["7.2", "7.4"] },
    { "id": 5, "tasks": ["7.5", "8.1", "9.1"] },
    { "id": 6, "tasks": ["7.6", "11.1", "11.2"] },
    { "id": 7, "tasks": ["12.1", "12.2", "12.3", "12.4"] },
    { "id": 8, "tasks": ["12.5", "13.1", "14.1"] }
  ]
}
```
