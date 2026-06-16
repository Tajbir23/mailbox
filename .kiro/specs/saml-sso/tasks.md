# Implementation Plan: SAML 2.0 Identity Provider

## Overview

Add a SAML 2.0 Identity Provider to the Mailbox application alongside the existing OIDC provider (which remains untouched). This implementation adds X.509 signing-certificate management, SAML protocol utilities (metadata, AuthnRequest parsing, response/assertion construction, XML signing), the metadata and SSO endpoints, a `SAMLClient` Mongoose model, admin management API + UI, and setup/env wiring. Built in JavaScript on Next.js 14 App Router with MongoDB/Mongoose and NextAuth.js, mirroring the OIDC patterns (`lib/oidc/*`, `app/api/oidc/*`, `app/admin/oauth-clients`). XML construction uses `xmlbuilder2`; XML signing uses `xml-crypto`; AuthnRequest inflate uses Node `zlib`.

## Tasks

- [ ] 1. Dependencies, Signing Certificate, and Environment Configuration
  - [~] 1.1 Add SAML dependencies
    - Add `xml-crypto`, `xmlbuilder2`, and `@xmldom/xmldom` to `package.json` dependencies
    - Add `fast-check` to devDependencies for property-based tests
    - Add an npm script `generate-saml-cert` -> `node scripts/generate-saml-cert.js`
    - _Requirements: 6.1, 6.2, 6.3_

  - [~] 1.2 Create the self-signed SAML certificate generation script
    - Create `scripts/generate-saml-cert.js` that generates a 2048-bit RSA key pair and a matching self-signed X.509 certificate (PEM), then prints base64-encoded PEM values for `SAML_SIGNING_CERT` and `SAML_SIGNING_KEY` ready to paste into `.env.local`
    - Mirror the style of `scripts/generate-rsa-keys.js`; use Node `crypto` (and a minimal cert builder) so no extra runtime dependency is required to run the script
    - Print a short usage banner consistent with the OIDC key script
    - _Requirements: 2.4_

  - [~] 1.3 Create the SAML key/cert loader and host helper
    - Create `lib/saml/keys.js` that loads `SAML_SIGNING_CERT` and `SAML_SIGNING_KEY` from environment (base64-encoded PEM), with lazy module-scope caching like `lib/oidc/keys.js`
    - Export `loadSigningCert()` (throws a config error naming the missing variable when absent/empty), `getPrivateKey()` (PEM for the signer), and `getCertDerBase64()` (single-line base64 DER body of the certificate for `KeyInfo`/metadata)
    - Export `getEntityIdFromHeaders(headers)` and `samlUrls(headers)` returning `{ origin, entityId, ssoUrl, metadataUrl }`, deriving host from `x-forwarded-host`/`host` and scheme per the OIDC pattern (production always `https`), falling back to `OIDC_ISSUER_URL` when no host header is present; entityId = `${origin}/api/saml/metadata`, ssoUrl = `${origin}/api/saml/sso`
    - Use env var names distinct from the OIDC RSA variables
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 4.5, 12.1, 12.2, 12.3, 12.6_

  - [~] 1.4 Add SAML environment variables to local configuration
    - Add `SAML_SIGNING_CERT` and `SAML_SIGNING_KEY` to `.env.local` and `.env.production` with placeholder values, documented in a comment block noting they are base64-encoded PEM and distinct from OIDC keys
    - _Requirements: 2.1, 2.5_

- [ ] 2. SAMLClient Data Model
  - [~] 2.1 Create the SAMLClient Mongoose model
    - Create `lib/models/SAMLClient.js` with fields: `sp_entity_id` (String, unique, trim, required), `display_name` (String, required, trim), `acs_urls` (array of strings), `default_acs_url` (String, nullable), `nameid_format` (String, default `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`), `attribute_mapping` (Map of String, optional), `active` (Boolean, default true), timestamps
    - Enforce `sp_entity_id` uniqueness via the field-level unique index; use the `mongoose.models.SAMLClient || mongoose.model(...)` export guard
    - _Requirements: 8.1, 8.7_

- [ ] 3. SAML Protocol Utilities (pure layer)
  - [~] 3.1 Implement AuthnRequest decoding and parsing
    - Create `lib/saml/authn-request.js` exporting `decodeRedirect(param)` (base64-decode + `zlib.inflateRawSync`), `decodePost(field)` (base64-decode), and `parseAuthnRequest(xml)` using `@xmldom/xmldom`
    - `parseAuthnRequest` returns `{ id, issuer, acsUrl, destination }`, extracting `@ID`, `<saml:Issuer>` text, `@AssertionConsumerServiceURL` (nullable), and `@Destination`
    - Throw a typed `AuthnRequestError` for absent/malformed/unparseable input
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [~] 3.2 Implement the ACS resolution decision logic
    - Create `lib/saml/acs.js` exporting `resolveClientAndAcs(client, requestedAcsUrl)` returning `{ ok: true, acsUrl }` or `{ ok: false, reason }` per the design decision table (unknown/inactive client -> `unknown_sp`; requested ACS not allow-listed -> `acs_not_allowed`; requested ACS allow-listed -> use it; absent + default -> use default; absent + no default -> `no_acs`)
    - The resolved ACS is always one recorded on the client; never an ACS supplied only by the request
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 11.1, 11.5_

  - [~] 3.3 Implement attribute mapping
    - Create `lib/saml/attributes.js` exporting `buildAttributes(user, attributeMapping)` returning `[{ name, values: [...] }]`
    - Always include the email attribute (default name `email`, overridable by mapping); derive `givenName` (first name token) and `surname` (remaining tokens) from `user.name`; omit any optional attribute whose value is unavailable (no empty `AttributeValue`); apply SP-specified attribute names when a mapping is present, while always emitting email
    - _Requirements: 5.4, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [~] 3.4 Implement metadata XML construction
    - Create `lib/saml/metadata.js` exporting `buildMetadata({ entityId, ssoUrl, certDerBase64 })` using `xmlbuilder2`
    - Produce `md:EntityDescriptor` with `entityID`, an `IDPSSODescriptor` containing a signing `KeyDescriptor` (embedded `X509Certificate` = certDerBase64), `NameIDFormat` = emailAddress, and `SingleSignOnService` entries for both HTTP-Redirect and HTTP-POST bindings pointing at `ssoUrl`
    - _Requirements: 1.1, 1.3, 1.4, 1.5_

- [ ] 4. SAML Response Construction and Signing
  - [~] 4.1 Implement the SAML Response/Assertion builder
    - Create `lib/saml/response.js` exporting `buildResponse({ entityId, acsUrl, inResponseTo, spEntityId, user, nameIdFormat, attributeMapping, now })` returning `{ xml, responseId, assertionId }`
    - Build a `samlp:Response` containing exactly one `saml:Assertion` with: `Issuer` = entityId (on both Response and Assertion); `Subject` NameID = user email with `nameIdFormat`; `SubjectConfirmationData` with `InResponseTo`, `Recipient` = acsUrl, and a bounded `NotOnOrAfter`; `Conditions` with `NotBefore`/`NotOnOrAfter` (<= NotBefore + 5 min) and `AudienceRestriction` = spEntityId; `AuthnStatement` with `AuthnInstant` and a session `AuthnContextClassRef`; `AttributeStatement` from `buildAttributes`; `Response@Destination` = acsUrl; `Response@InResponseTo` = inResponseTo
    - Generate unique IDs for Response and Assertion (e.g. `_` + `crypto.randomUUID()`)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 11.2, 11.3, 11.4, 12.5_

  - [~] 4.2 Implement XML digital signature over the assertion
    - Create `lib/saml/sign.js` exporting `signAssertion(responseXml, assertionId)` using `xml-crypto` `SignedXml`
    - Configure RSA-SHA256 signature algorithm, exclusive c14n (`xml-exc-c14n#`) plus enveloped-signature transform, SHA-256 digest, reference URI `#${assertionId}`, and a `KeyInfo` provider emitting `X509Data/X509Certificate` = `getCertDerBase64()`
    - Insert the `Signature` element immediately after the Assertion `Issuer` (schema-required position)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 4.3 Write property tests for the pure SAML layer
    - Using `fast-check` (min 100 iterations, tagged `// Feature: saml-sso, Property {n}: ...`), implement Properties 3 (metadata structure), 4 (cert/key round-trip + match), 5 (AuthnRequest binding round-trip), 6 (malformed rejection), 9 (ACS decision table), 10 (assertion structure/content), 11 (validity window), 12 (unique IDs), 13 (signature validity + metadata consistency), 14 (signature placement), and 15 (attribute mapping)
    - _Requirements: 1.1, 1.3, 1.4, 2.1, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 5.x, 6.x, 8.3, 8.4, 8.5, 8.6, 9.x, 11.2, 11.3, 11.4, 11.5_

- [~] 5. Checkpoint - Pure SAML layer complete
  - Ensure metadata, parsing, response, signing, ACS, and attribute utilities work and (if implemented) property tests pass. Ask the user if questions arise.

- [ ] 6. SAML Protocol Endpoints
  - [~] 6.1 Implement the metadata endpoint
    - Create `app/api/saml/metadata/route.js` (`dynamic = "force-dynamic"`) handling `GET`
    - Derive `{ entityId, ssoUrl }` from request headers via `samlUrls`, call `buildMetadata` with `getCertDerBase64()`, and return XML with `Content-Type: application/samlmetadata+xml`
    - _Requirements: 1.1, 1.2, 1.6, 12.1, 12.4_

  - [~] 6.2 Implement the SSO endpoint request-handling path
    - Create `app/api/saml/sso/route.js` (`dynamic = "force-dynamic"`) handling `GET` (HTTP-Redirect) and `POST` (HTTP-POST) via a shared handler
    - Extract `SAMLRequest` + `RelayState` (query for GET, form body for POST); decode by binding and `parseAuthnRequest`; on absent/malformed input return HTTP 400 with no SAML_Response
    - `dbConnect()`, look up active `SAMLClient` by `sp_entity_id == issuer`, run `resolveClientAndAcs`; on failure return HTTP 403/400 with no SAML_Response
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 8.2, 8.3, 8.4, 8.5, 8.6, 11.1, 11.5_

  - [~] 6.3 Implement session check and login resumption
    - In the SSO handler, call `getServerSession(authOptions)`; when no session, 302-redirect to `${origin}/login?callbackUrl=...` where the callbackUrl points back to `/api/saml/sso` with `SAMLRequest`, `binding`, and `RelayState` preserved (origin host-derived, never `request.url`)
    - Confirm the existing login page performs a full-navigation for `/api/` callback URLs (it does) and reuse it unchanged so the flow resumes after login
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [~] 6.4 Implement signed-response generation and ACS auto-POST delivery
    - When a session exists and the SP/ACS resolved, call `buildResponse` then `signAssertion`, base64-encode the signed XML, and return an HTML document that auto-submits a form via HTTP-POST to the resolved record ACS URL with the `SAMLResponse` field (and `RelayState` field when supplied, unchanged)
    - The form `action` must be the record-derived ACS URL only
    - _Requirements: 5.x, 7.1, 7.2, 7.3, 7.4, 11.5, 12.5_

  - [ ]* 6.5 Write endpoint-level tests
    - Example tests: no-session redirect target (4.1), login callbackUrl param preservation round-trip (Property 8 / 4.2), active-session direct path (4.4), 400 on malformed request, 403 on unknown SP; and Properties 7 (RelayState preservation) and 16 (ACS auto-POST form) at the handler boundary
    - _Requirements: 3.4, 4.1, 4.2, 4.4, 7.1, 7.2, 7.3, 7.4, 8.3_

- [~] 7. Checkpoint - SAML SSO flow end to end
  - Verify metadata retrieval and an SP-initiated flow (AuthnRequest -> login -> signed Response auto-POST). Ask the user if questions arise.

- [ ] 8. Admin Management API and UI
  - [~] 8.1 Create the SAML clients admin collection API
    - Create `app/api/admin/saml-clients/route.js` (`dynamic = "force-dynamic"`) with `GET` (list all records) and `POST` (create), admin-gated via `getServerSession` + `session.user.role === "admin"` (403 otherwise)
    - Validate `sp_entity_id` and at least one ACS URL on create (400 otherwise); return 409 on duplicate `sp_entity_id`
    - Mirror the structure of `app/api/admin/oauth-clients/route.js`
    - _Requirements: 8.1, 8.7, 10.1, 10.2, 10.5, 10.6_

  - [~] 8.2 Create the SAML client item API
    - Create `app/api/admin/saml-clients/[id]/route.js` with `GET` (detail), `PATCH` (update display_name, acs_urls, default_acs_url, nameid_format, attribute_mapping, active), and `DELETE`, all admin-gated (deny non-admins with 403)
    - _Requirements: 10.3, 10.5, 10.6_

  - [~] 8.3 Create the SAML clients admin UI page
    - Create `app/admin/saml-clients/page.js` mirroring `app/admin/oauth-clients/page.js`: table of SP records (display_name, sp_entity_id, ACS count, status, created), create/edit/delete modals, and a read-only display of the current domain Metadata_Endpoint URL derived from `window.location.origin`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 9. Setup and Deployment Wiring
  - [~] 9.1 Add SAML certificate generation to the VPS setup script
    - Update `scripts/vps-setup-genuinesoftmart.sh` to auto-generate the SAML signing cert + key during environment setup, reusing existing `SAML_SIGNING_CERT`/`SAML_SIGNING_KEY` values when already present (so re-running does not invalidate trust), mirroring the existing OIDC RSA key reuse logic
    - Append `SAML_SIGNING_CERT` and `SAML_SIGNING_KEY` to the generated `.env.local`/`.env.production`, and add the SAML metadata/admin URLs to the final summary banner
    - _Requirements: 2.1, 2.4, 2.5_

- [~] 10. Final Checkpoint - Full integration
  - Confirm OIDC is unaffected, SAML metadata/SSO/admin all work, and (if implemented) all property and example tests pass. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (test-writing) and can be skipped for a faster MVP.
- Each task references specific requirements for traceability.
- Implementation is JavaScript (not TypeScript), consistent with the existing codebase.
- The existing OIDC provider (`lib/oidc/`, `app/api/oidc/`, `app/.well-known/`) is not modified.
- The signing cert/key are stored as base64-encoded PEM env vars distinct from the OIDC RSA vars.
- All externally visible URLs (entityID, SSO, metadata, login origin) are derived from `x-forwarded-host`/`host`, never `request.url`.
- XML construction uses `xmlbuilder2`; XML signing/verification uses `xml-crypto`; AuthnRequest inflate uses Node `zlib`; property tests use `fast-check` (min 100 iterations, tagged per design property).
- The IdP never signs or emits a SAML_Response unless `resolveClientAndAcs` succeeds (open-relay protection).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "2.1"] },
    { "id": 1, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "id": 2, "tasks": ["4.1", "4.2"] },
    { "id": 3, "tasks": ["4.3", "6.1"] },
    { "id": 4, "tasks": ["6.2", "6.3", "6.4"] },
    { "id": 5, "tasks": ["6.5", "8.1", "8.2"] },
    { "id": 6, "tasks": ["8.3", "9.1"] }
  ]
}
```
