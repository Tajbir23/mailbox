# Requirements Document

## Introduction

This feature transforms the Mailbox application into a fully compliant OpenID Connect (OIDC) Identity Provider (IdP). External services such as ChatGPT Teams/Enterprise, Slack, Notion, and any OIDC-compatible application will be able to use "Sign in with Mailbox" as a login option. The implementation leverages the existing credential-based authentication system (NextAuth.js, MongoDB, JWT sessions) as the identity verification layer and exposes standard OIDC protocol endpoints.

## Glossary

- **OIDC_Provider**: The Mailbox application acting as an OpenID Connect Identity Provider that issues identity tokens to relying parties
- **Relying_Party**: An external application (client) that delegates user authentication to the OIDC_Provider
- **Authorization_Endpoint**: The endpoint (/api/oidc/authorize) that initiates the authentication and consent flow
- **Token_Endpoint**: The endpoint (/api/oidc/token) that exchanges authorization codes for tokens
- **UserInfo_Endpoint**: The endpoint (/api/oidc/userinfo) that returns claims about the authenticated user
- **Discovery_Endpoint**: The endpoint (/.well-known/openid-configuration) that publishes OIDC_Provider metadata
- **JWKS_Endpoint**: The endpoint (/.well-known/jwks.json) that publishes the public signing keys
- **Authorization_Code**: A short-lived, single-use code issued after successful authentication and consent
- **ID_Token**: A signed JWT containing identity claims about the authenticated user
- **Access_Token**: A token granting access to the UserInfo_Endpoint and scoped resources
- **Refresh_Token**: A long-lived token used to obtain new Access_Tokens without re-authentication
- **PKCE**: Proof Key for Code Exchange — a mechanism to prevent authorization code interception attacks
- **OAuth_Client**: A registered application with a client_id, client_secret, redirect_uris, and allowed scopes
- **Consent_Screen**: A UI page where users approve or deny a Relying_Party's request to access their identity information
- **Revocation_Endpoint**: The endpoint (/api/oidc/revoke) that invalidates issued tokens
- **Admin_Panel**: The administrative interface for managing OAuth_Clients and authorizations
- **Scope**: A permission identifier (openid, profile, email) that determines which claims are included in tokens
- **Claim**: A key-value pair of user identity information included in tokens (sub, email, name, etc.)

## Requirements

### Requirement 1: OIDC Discovery

**User Story:** As a Relying_Party developer, I want to discover the OIDC_Provider's capabilities and endpoints via a standard discovery document, so that I can configure my application for SSO integration without manual endpoint lookups.

#### Acceptance Criteria

1. WHEN a GET request is made to /.well-known/openid-configuration, THE Discovery_Endpoint SHALL return a JSON document containing issuer, authorization_endpoint, token_endpoint, userinfo_endpoint, jwks_uri, revocation_endpoint, response_types_supported, subject_types_supported, id_token_signing_alg_values_supported, scopes_supported, and token_endpoint_auth_methods_supported
2. THE Discovery_Endpoint SHALL return an HTTP 200 status with Content-Type application/json
3. WHEN a GET request is made to /.well-known/jwks.json, THE JWKS_Endpoint SHALL return a JSON Web Key Set containing the public RSA keys used for signing ID_Tokens
4. THE Discovery_Endpoint SHALL use the primary application domain (configured via environment variable) as the issuer value regardless of which custom domain the request originates from, to maintain a single consistent issuer across multi-domain deployments

### Requirement 2: OAuth Client Registration

**User Story:** As an administrator, I want to register and manage OAuth_Clients through the Admin_Panel, so that I can control which external applications are allowed to use Mailbox as an identity provider.

#### Acceptance Criteria

1. WHEN an admin creates a new OAuth_Client, THE Admin_Panel SHALL generate a unique client_id and client_secret and store the client record in the database
2. THE OIDC_Provider SHALL require each OAuth_Client record to contain a client_id, client_secret_hash (for confidential clients), client_type (public or confidential), display_name, redirect_uris (array), allowed_scopes (array), and active status
3. WHEN an admin updates an OAuth_Client, THE Admin_Panel SHALL allow modification of display_name, redirect_uris, allowed_scopes, and active status
4. WHEN an admin deletes an OAuth_Client, THE Admin_Panel SHALL mark the client as inactive and revoke all associated active tokens
5. THE Admin_Panel SHALL restrict OAuth_Client management operations to users with the admin role

### Requirement 3: Authorization Code Flow

**User Story:** As a Relying_Party, I want to initiate the OIDC authorization code flow, so that my users can authenticate with their Mailbox credentials and grant my application access to their identity information.

#### Acceptance Criteria

1. WHEN a valid authorization request is received at the Authorization_Endpoint with response_type=code, client_id, redirect_uri, scope, and state parameters, THE OIDC_Provider SHALL validate the client_id and redirect_uri against the registered OAuth_Client
2. IF the client_id is not registered or the redirect_uri does not match any registered URI for that client, THEN THE Authorization_Endpoint SHALL display an error page without redirecting to the unregistered URI
3. WHEN the authorization request parameters are valid and the user is not authenticated, THE Authorization_Endpoint SHALL redirect the user to the login page and return to the authorization flow after successful authentication
4. WHEN the authorization request parameters are valid and the user is already authenticated and has not previously granted consent for the requested scopes, THE Authorization_Endpoint SHALL display the Consent_Screen
5. WHEN the user grants consent on the Consent_Screen, THE Authorization_Endpoint SHALL generate a single-use Authorization_Code with a maximum lifetime of 60 seconds and redirect to the redirect_uri with the code and state parameters
6. WHEN the user denies consent on the Consent_Screen, THE Authorization_Endpoint SHALL redirect to the redirect_uri with error=access_denied and the state parameter
7. THE Authorization_Code SHALL be bound to the client_id, redirect_uri, user identity, requested scopes, and PKCE code_challenge

### Requirement 4: PKCE Support

**User Story:** As a Relying_Party developer, I want to use PKCE in the authorization flow, so that authorization code interception attacks are mitigated for public clients and enhanced security is provided for confidential clients.

#### Acceptance Criteria

1. WHEN an authorization request includes code_challenge and code_challenge_method parameters, THE Authorization_Endpoint SHALL store the code_challenge with the Authorization_Code
2. THE OIDC_Provider SHALL support code_challenge_method value of S256 only, as plain method is deprecated per OAuth 2.1 security best practices
3. WHEN an authorization request includes code_challenge_method=S256, THE Token_Endpoint SHALL verify that BASE64URL(SHA256(code_verifier)) matches the stored code_challenge during code exchange
4. IF the code_verifier is missing or does not match the stored code_challenge, THEN THE Token_Endpoint SHALL return an error response with error=invalid_grant
5. WHEN an OAuth_Client is configured as a public client, THE OIDC_Provider SHALL require PKCE parameters in the authorization request

### Requirement 5: Token Issuance

**User Story:** As a Relying_Party, I want to exchange an Authorization_Code for ID, access, and refresh tokens, so that I can verify the user's identity and access their profile information.

#### Acceptance Criteria

1. WHEN a valid token request is received at the Token_Endpoint with grant_type=authorization_code, code, redirect_uri, and client_id, THE Token_Endpoint SHALL validate the Authorization_Code, client authentication, and redirect_uri
2. WHEN the OAuth_Client is a confidential client, THE Token_Endpoint SHALL require client_secret for authentication
3. WHEN the OAuth_Client is a public client, THE Token_Endpoint SHALL authenticate the client using the PKCE code_verifier instead of client_secret
4. WHEN validation succeeds, THE Token_Endpoint SHALL return a JSON response containing id_token, access_token, refresh_token (for confidential clients only), token_type=Bearer, and expires_in
5. THE Token_Endpoint SHALL issue ID_Tokens as signed JWTs using RS256 algorithm containing at minimum the claims: iss, sub, aud, exp, iat, and nonce (if provided in the authorization request)
6. THE Token_Endpoint SHALL issue Access_Tokens with a lifetime of 3600 seconds (1 hour) and Refresh_Tokens with a lifetime of 2592000 seconds (30 days)
7. WHEN grant_type=refresh_token is received with a valid Refresh_Token, THE Token_Endpoint SHALL issue a new Access_Token and rotate the Refresh_Token
8. IF the Authorization_Code has already been used or has expired, THEN THE Token_Endpoint SHALL return an error response with error=invalid_grant
9. IF the client credentials are invalid, THEN THE Token_Endpoint SHALL return an HTTP 401 response with error=invalid_client
10. THE Token_Endpoint SHALL invalidate the Authorization_Code after a single successful exchange

### Requirement 6: UserInfo Endpoint

**User Story:** As a Relying_Party, I want to retrieve user profile claims using an Access_Token, so that I can personalize my application with the authenticated user's information.

#### Acceptance Criteria

1. WHEN a GET or POST request is received at the UserInfo_Endpoint with a valid Access_Token in the Authorization header (Bearer scheme), THE UserInfo_Endpoint SHALL return a JSON object containing claims corresponding to the scopes granted during authorization
2. WHEN the openid scope was granted, THE UserInfo_Endpoint SHALL include the sub claim
3. WHEN the profile scope was granted, THE UserInfo_Endpoint SHALL include the name claim
4. WHEN the email scope was granted, THE UserInfo_Endpoint SHALL include the email and email_verified claims
5. IF the Access_Token is missing, expired, or invalid, THEN THE UserInfo_Endpoint SHALL return an HTTP 401 response with a WWW-Authenticate header

### Requirement 7: Consent Management

**User Story:** As a Mailbox user, I want to review and control which external applications have access to my identity information, so that I can revoke access when I no longer trust or use those applications.

#### Acceptance Criteria

1. WHEN a user visits the Consent_Screen during an authorization flow, THE Consent_Screen SHALL display the Relying_Party's display_name, the requested scopes with human-readable descriptions, and approve/deny buttons
2. WHEN a user has previously granted consent to a Relying_Party for the same or a superset of the requested scopes, THE Authorization_Endpoint SHALL skip the Consent_Screen and issue an Authorization_Code directly
3. WHEN a Relying_Party requests scopes beyond what the user previously consented to, THE Authorization_Endpoint SHALL display the Consent_Screen showing the additional scopes being requested
4. WHEN a user revokes consent for a Relying_Party through their dashboard, THE OIDC_Provider SHALL invalidate all active Access_Tokens and Refresh_Tokens for that client-user pair
5. THE OIDC_Provider SHALL store consent records containing user_id, client_id, granted_scopes, and granted_at timestamp

### Requirement 8: Scopes and Claims

**User Story:** As a Relying_Party developer, I want to request specific scopes to receive corresponding user claims, so that I only receive the identity information my application needs.

#### Acceptance Criteria

1. THE OIDC_Provider SHALL support the following scopes: openid (required, provides sub claim), profile (provides name claim), email (provides email and email_verified claims), and offline_access (enables Refresh_Token issuance for confidential clients)
2. WHEN a token request is processed, THE Token_Endpoint SHALL include only claims corresponding to the granted scopes in the ID_Token
3. IF the openid scope is not included in an authorization request, THEN THE Authorization_Endpoint SHALL return an error response with error=invalid_scope
4. THE OIDC_Provider SHALL map user claims from the existing User model: sub from user MongoDB _id, email from user email field, name from user name field, and email_verified set to true for all active users (since account creation requires email input and no unverified state exists in the current model)

### Requirement 9: Admin Panel for OAuth Client Management

**User Story:** As an administrator, I want a dedicated section in the Admin_Panel for managing OAuth_Clients and monitoring active authorizations, so that I can maintain oversight of which services are integrated and who has granted access.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display a list of all registered OAuth_Clients showing display_name, client_id, active status, number of active authorizations, and creation date
2. WHEN an admin views an OAuth_Client detail page, THE Admin_Panel SHALL show the client_id, redirect_uris, allowed_scopes, creation date, and a count of users who have granted consent
3. WHEN an admin clicks "Regenerate Secret" for an OAuth_Client, THE Admin_Panel SHALL generate a new client_secret, display it once, and invalidate the previous secret
4. THE Admin_Panel SHALL provide a view of all active user-client authorizations with the ability to revoke individual authorizations
5. THE Admin_Panel SHALL only be accessible to users with the admin role

### Requirement 10: Security Controls

**User Story:** As an administrator, I want robust security measures on all OIDC endpoints, so that the identity provider is resistant to common attacks and compliant with security best practices.

#### Acceptance Criteria

1. THE Token_Endpoint SHALL enforce rate limiting of 20 requests per minute per client_id to prevent brute-force attacks
2. THE OIDC_Provider SHALL set appropriate CORS headers on the Discovery_Endpoint, JWKS_Endpoint, and Token_Endpoint to allow cross-origin requests from registered redirect_uri origins
3. THE Token_Endpoint SHALL accept client authentication via HTTP Basic auth or POST body parameters (client_id and client_secret)
4. THE OIDC_Provider SHALL store client_secret values as bcrypt hashes and never expose them after initial creation
5. WHEN a Refresh_Token is used for token renewal, THE Token_Endpoint SHALL invalidate the previous Refresh_Token immediately upon issuing the new token pair
6. IF a previously invalidated Refresh_Token is presented, THEN THE Token_Endpoint SHALL revoke all tokens for that client-user pair as a security precaution
7. THE OIDC_Provider SHALL sign all ID_Tokens using RSA keys with a minimum length of 2048 bits

### Requirement 11: Session Integration

**User Story:** As a Mailbox user, I want the OIDC flow to respect my existing Mailbox session, so that I do not need to re-enter my credentials when I am already logged in.

#### Acceptance Criteria

1. WHILE a user has an active NextAuth.js session, THE Authorization_Endpoint SHALL skip the login step and proceed directly to the Consent_Screen or Authorization_Code issuance
2. WHILE a user does not have an active NextAuth.js session, THE Authorization_Endpoint SHALL redirect to the Mailbox login page with a return URL that resumes the authorization flow after successful login
3. WHEN the user completes login during an OIDC flow, THE Authorization_Endpoint SHALL preserve all original authorization request parameters (client_id, redirect_uri, scope, state, nonce, PKCE parameters) across the login redirect

### Requirement 12: Token Revocation

**User Story:** As a Relying_Party developer, I want to revoke tokens when a user logs out of my application, so that abandoned tokens cannot be misused.

#### Acceptance Criteria

1. WHEN a POST request is received at /api/oidc/revoke with a valid token and token_type_hint parameter, THE OIDC_Provider SHALL invalidate the specified token
2. THE OIDC_Provider SHALL accept token_type_hint values of access_token and refresh_token
3. WHEN a Refresh_Token is revoked, THE OIDC_Provider SHALL also invalidate all Access_Tokens issued from that Refresh_Token
4. THE OIDC_Provider SHALL return an HTTP 200 response for revocation requests regardless of whether the token was valid, to prevent token existence probing
5. THE OIDC_Provider SHALL require client authentication (client_id and client_secret) on revocation requests
