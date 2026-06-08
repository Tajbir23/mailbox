# Requirements Document

## Introduction

This feature adds a **SAML 2.0 Identity Provider (IdP)** to the Mailbox application, allowing external Service Providers (Relying Parties) — primarily ChatGPT Enterprise/Business custom SAML connections, but also any standards-compliant SAML 2.0 SP — to authenticate users via "Sign in with Mailbox".

The SAML IdP is added **alongside** the existing OIDC Identity Provider. The OIDC code (in `lib/oidc/`, `app/api/oidc/`, `app/.well-known/`) remains fully intact and unchanged; SAML reuses the same patterns (env-loaded keys, multi-domain host derivation, NextAuth session, admin-managed clients) without replacing OIDC.

The application is multi-tenant / white-label: each customer has a custom domain (e.g. `securegptpoint.store`) pointed at the same server via Caddy On-Demand TLS. The IdP runs behind a Caddy reverse proxy, so the public host MUST be derived from `x-forwarded-host` / `host` headers (NOT `request.url`, which resolves to `127.0.0.1:3000`). The SAML IdP entityID, SSO endpoint, and metadata URL MUST reflect the requesting host so each white-label domain acts as its own independent SAML IdP.

The implementation will likely use a SAML library (e.g. `samlify`, `@node-saml/node-saml`, or `saml2-js`) for XML construction and signing. These requirements specify externally observable behavior (spec-compliant signed XML, correct bindings, correct attribute mapping) and remain solution-free regarding the specific library chosen.

## Glossary

- **SAML_IdP**: The Mailbox SAML 2.0 Identity Provider system being built in this feature.
- **Service_Provider (SP)**: An external relying party that consumes SAML assertions (e.g. ChatGPT Enterprise SAML connection, WorkOS).
- **IdP_EntityID**: The unique SAML identifier of the Mailbox IdP for a given domain, derived from the requesting host (e.g. `https://securegptpoint.store/api/saml/metadata`).
- **SP_EntityID**: The unique SAML identifier provided by a registered Service Provider.
- **Metadata_Endpoint**: The HTTP endpoint that serves IdP metadata XML for the requesting domain.
- **SSO_Endpoint**: The IdP Single Sign-On service endpoint that receives and processes AuthnRequests.
- **AuthnRequest**: A SAML 2.0 `<samlp:AuthnRequest>` message sent by an SP to initiate SP-initiated SSO.
- **SAML_Response**: A signed SAML 2.0 `<samlp:Response>` message containing a signed `<saml:Assertion>`, returned to the SP.
- **Assertion**: The signed SAML statement about an authenticated user (Subject, AuthnStatement, AttributeStatement, Conditions).
- **ACS_URL**: The Assertion Consumer Service URL of an SP, where the SAML_Response is delivered via HTTP-POST.
- **RelayState**: An opaque SP-provided value echoed back unchanged with the SAML_Response.
- **NameID**: The Subject identifier in the Assertion (the user's email address for this feature).
- **HTTP_Redirect_Binding**: SAML binding where the AuthnRequest is deflated, base64-encoded, and passed as a URL query parameter.
- **HTTP_POST_Binding**: SAML binding where the SAML message is base64-encoded and submitted as an HTML form field.
- **Signing_Certificate**: The X.509 self-signed certificate (and its RSA private key) used to sign assertions and responses.
- **SAML_Client_Record**: A persisted MongoDB record describing a registered Service_Provider (SP_EntityID, ACS_URL, NameID format, attribute mapping, active flag).
- **NextAuth_Session**: The existing NextAuth.js JWT session that represents an authenticated Mailbox User.
- **Admin**: A User whose role is `admin`, authorized to manage SAML_Client_Records.
- **Requesting_Host**: The public hostname for the current request, derived from `x-forwarded-host` or `host` headers.

## Requirements

### Requirement 1: SAML IdP Metadata Endpoint

**User Story:** As an SP administrator, I want to retrieve the Mailbox IdP metadata XML for my domain, so that I can configure my Service Provider to trust the Mailbox IdP.

#### Acceptance Criteria

1. WHEN a GET request is received at the Metadata_Endpoint, THE SAML_IdP SHALL return a SAML 2.0 `EntityDescriptor` XML document with `Content-Type` `application/samlmetadata+xml` or `application/xml`.
2. THE SAML_IdP SHALL set the metadata `entityID` to the IdP_EntityID derived from the Requesting_Host.
3. THE SAML_IdP SHALL include an `IDPSSODescriptor` element containing the SSO_Endpoint URL for both HTTP_Redirect_Binding and HTTP_POST_Binding.
4. THE SAML_IdP SHALL include the base64-encoded X.509 Signing_Certificate in a `KeyDescriptor` element with `use="signing"`.
5. THE SAML_IdP SHALL declare the supported NameID format `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress` in the metadata.
6. WHEN the Requesting_Host changes between requests, THE SAML_IdP SHALL produce metadata whose `entityID` and SSO_Endpoint URLs reflect the current Requesting_Host.

### Requirement 2: X.509 Signing Certificate Management

**User Story:** As a system operator, I want the SAML signing certificate and private key loaded from environment configuration, so that the IdP can sign assertions consistently across deployments without storing secrets in code.

#### Acceptance Criteria

1. THE SAML_IdP SHALL load the Signing_Certificate and its RSA private key from environment variables containing base64-encoded PEM values.
2. IF a required signing environment variable is missing or empty WHEN a signing operation is requested, THEN THE SAML_IdP SHALL raise a configuration error identifying the missing variable.
3. THE SAML_IdP SHALL expose the X.509 Signing_Certificate in base64 DER form for inclusion in metadata and signatures.
4. WHERE a self-signed certificate generation utility is provided, THE SAML_IdP SHALL produce an RSA private key and a matching X.509 certificate in PEM format suitable for the signing environment variables.
5. THE SAML_IdP SHALL load the Signing_Certificate using environment variable names distinct from the existing OIDC RSA key variables.

### Requirement 3: SP-Initiated SSO AuthnRequest Handling

**User Story:** As a user, I want my Service Provider to initiate sign-in through Mailbox, so that I can access the SP using my Mailbox account.

#### Acceptance Criteria

1. WHEN an AuthnRequest is received at the SSO_Endpoint via HTTP_Redirect_Binding, THE SAML_IdP SHALL inflate and base64-decode the `SAMLRequest` query parameter and parse the AuthnRequest.
2. WHEN an AuthnRequest is received at the SSO_Endpoint via HTTP_POST_Binding, THE SAML_IdP SHALL base64-decode the `SAMLRequest` form field and parse the AuthnRequest.
3. WHEN the AuthnRequest has been parsed successfully, THE SAML_IdP SHALL extract the SP_EntityID (Issuer), the request ID, the requested ACS_URL, and the RelayState from the received request.
4. IF the `SAMLRequest` parameter is absent, malformed, or cannot be parsed, THEN THE SAML_IdP SHALL return an HTTP 400 response with a descriptive error and SHALL NOT generate a SAML_Response, regardless of how many error conditions are met simultaneously.
5. THE SAML_IdP SHALL preserve the RelayState value unchanged for inclusion in the eventual ACS POST.

### Requirement 4: User Authentication and Flow Resumption

**User Story:** As a user, I want to log in with my Mailbox credentials when I am not already signed in, so that the SP receives my identity after authentication.

#### Acceptance Criteria

1. WHEN an AuthnRequest is processed AND no active NextAuth_Session exists, THE SAML_IdP SHALL redirect the user to the Mailbox login page using the origin derived from the Requesting_Host.
2. WHEN redirecting to the login page, THE SAML_IdP SHALL preserve the `SAMLRequest`, binding, and RelayState so the SAML flow resumes after successful login.
3. WHEN a user completes login AND a preserved SAML flow exists, THE SAML_IdP SHALL resume processing the original AuthnRequest and continue to SAML_Response generation.
4. WHILE an active NextAuth_Session exists, THE SAML_IdP SHALL proceed directly to SAML_Response generation without prompting for credentials.
5. THE SAML_IdP SHALL derive the login redirect origin from the `x-forwarded-host` or `host` headers rather than from the request URL.

### Requirement 5: SAML Response and Assertion Generation

**User Story:** As an SP, I want a complete SAML Response describing the authenticated user, so that I can establish a session for that user.

#### Acceptance Criteria

1. WHEN an authenticated user's SAML flow proceeds to response generation, THE SAML_IdP SHALL construct a `samlp:Response` containing one `saml:Assertion`.
2. THE SAML_IdP SHALL set the Assertion Subject NameID to the authenticated user's email address using the configured NameID format.
3. THE SAML_IdP SHALL include an `AuthnStatement` with an `AuthnInstant` timestamp and a session-based `AuthnContextClassRef`.
4. THE SAML_IdP SHALL include an `AttributeStatement` containing the user's email attribute, and SHALL include first name (`givenName`) and last name (`surname`) attributes when those values are available, omitting any name attribute element whose value is unavailable.
5. THE SAML_IdP SHALL include a `Conditions` element with `NotBefore` and `NotOnOrAfter` timestamps and an `AudienceRestriction` whose audience equals the SP_EntityID.
6. THE SAML_IdP SHALL set the response `InResponseTo` attribute and the Subject `SubjectConfirmationData` `InResponseTo` attribute to the AuthnRequest request ID.
7. THE SAML_IdP SHALL set the Assertion `Issuer` and Response `Issuer` to the IdP_EntityID derived from the Requesting_Host.
8. THE SAML_IdP SHALL set the response `Destination` and the Subject `Recipient` to the registered ACS_URL of the SP.

### Requirement 6: XML Digital Signature

**User Story:** As an SP, I want the SAML assertion and response cryptographically signed, so that I can verify the message originated from the trusted Mailbox IdP and was not tampered with.

#### Acceptance Criteria

1. THE SAML_IdP SHALL sign the SAML Assertion using the X.509 Signing_Certificate private key with the RSA-SHA256 signature algorithm.
2. THE SAML_IdP SHALL use exclusive XML canonicalization (`http://www.w3.org/2001/10/xml-exc-c14n#`) when computing the signature.
3. THE SAML_IdP SHALL use SHA-256 (`http://www.w3.org/2001/04/xmlenc#sha256`) as the digest method for signed references.
4. THE SAML_IdP SHALL embed the signing X.509 certificate in the signature `KeyInfo` so the SP can validate the signature against the certificate published in metadata.
5. THE SAML_IdP SHALL place the `Signature` element in the position required by the SAML schema so standards-compliant SPs (including ChatGPT/WorkOS) accept the signed document.
6. FOR ALL generated SAML_Responses, the signature SHALL validate against the same Signing_Certificate published in the Metadata_Endpoint (signature/certificate consistency).

### Requirement 7: Assertion Consumer Service Delivery

**User Story:** As a user, I want my browser to deliver the SAML response back to my Service Provider automatically, so that sign-in completes without manual steps.

#### Acceptance Criteria

1. WHEN a signed SAML_Response is generated, THE SAML_IdP SHALL return an HTML document that auto-submits a form via HTTP-POST to the registered ACS_URL.
2. THE SAML_IdP SHALL include the base64-encoded SAML_Response as the `SAMLResponse` form field.
3. WHERE a RelayState was supplied in the AuthnRequest, THE SAML_IdP SHALL include the unchanged RelayState as the `RelayState` form field.
4. THE SAML_IdP SHALL target the auto-submitting form `action` at the ACS_URL recorded in the matching SAML_Client_Record.

### Requirement 8: Registered Service Provider Management (Data and Authorization)

**User Story:** As an admin, I want to register and manage SAML Service Providers, so that only approved SPs can receive assertions from the Mailbox IdP.

#### Acceptance Criteria

1. THE SAML_IdP SHALL persist each SAML_Client_Record with at least an SP_EntityID, one or more allowed ACS_URLs, a NameID format, and an active flag.
2. WHEN an AuthnRequest is received, THE SAML_IdP SHALL look up a SAML_Client_Record whose SP_EntityID matches the AuthnRequest Issuer.
3. IF no active SAML_Client_Record matches the AuthnRequest Issuer, THEN THE SAML_IdP SHALL reject the request with an HTTP error and SHALL NOT generate a SAML_Response.
4. IF the ACS_URL in the AuthnRequest is not among the allowed ACS_URLs of the matched SAML_Client_Record, THEN THE SAML_IdP SHALL reject the request and SHALL NOT generate a SAML_Response.
5. WHEN an AuthnRequest omits the ACS_URL, THE SAML_IdP SHALL use the default ACS_URL recorded in the matched SAML_Client_Record.
6. IF an AuthnRequest omits the ACS_URL AND the matched SAML_Client_Record has no recorded default ACS_URL, THEN THE SAML_IdP SHALL reject the request with an HTTP error and SHALL NOT generate a SAML_Response.
7. THE SAML_IdP SHALL enforce SP_EntityID uniqueness across SAML_Client_Records.

### Requirement 9: Attribute Mapping

**User Story:** As an SP administrator, I want Mailbox user fields mapped to the SAML attributes my SP expects, so that user provisioning works correctly.

#### Acceptance Criteria

1. THE SAML_IdP SHALL map the Mailbox User email field to the SAML email attribute in every Assertion.
2. THE SAML_IdP SHALL derive `givenName` (first name) and `surname` (last name) attribute values from the Mailbox User name field.
3. WHERE a SAML_Client_Record defines a custom attribute name mapping, THE SAML_IdP SHALL emit attributes using the SP-specified attribute names.
4. IF a mapped optional attribute value is unavailable for the user, THEN THE SAML_IdP SHALL omit that attribute rather than emit an empty value.
5. THE SAML_IdP SHALL always include the email attribute required by ChatGPT SAML connections, regardless of attribute mapping configuration.

### Requirement 10: Admin Panel for SAML Service Providers

**User Story:** As an admin, I want a panel to create, view, update, and delete SAML SPs and view the metadata URL, so that I can manage SAML integrations without editing the database directly.

#### Acceptance Criteria

1. WHILE an Admin is authenticated, THE SAML_IdP SHALL allow creating a SAML_Client_Record with SP_EntityID, ACS_URL(s), NameID format, and attribute mapping.
2. WHILE an Admin is authenticated, THE SAML_IdP SHALL allow viewing the list of existing SAML_Client_Records.
3. WHILE an Admin is authenticated, THE SAML_IdP SHALL allow updating and deleting an existing SAML_Client_Record, AND SHALL deny update and delete operations to any requester who is not an authenticated Admin.
4. THE SAML_IdP SHALL display the Metadata_Endpoint URL for the current domain in the admin panel.
5. IF a non-admin user requests a SAML SP management operation, THEN THE SAML_IdP SHALL deny the request with an authorization error.
6. IF an Admin submits a SAML_Client_Record with a missing SP_EntityID or a missing ACS_URL, THEN THE SAML_IdP SHALL reject the submission with a validation error.

### Requirement 11: Security Controls

**User Story:** As a security stakeholder, I want the IdP to issue assertions only to approved SPs with short-lived, replay-resistant assertions, so that the IdP cannot be abused as an open relay.

#### Acceptance Criteria

1. THE SAML_IdP SHALL generate and sign a SAML_Response only for an AuthnRequest whose Issuer matches an active SAML_Client_Record and whose ACS_URL is allowed for that record.
2. THE SAML_IdP SHALL set the Assertion `NotOnOrAfter` to no more than 5 minutes after the `NotBefore` timestamp.
3. THE SAML_IdP SHALL assign a unique ID to each generated SAML_Response and each Assertion.
4. THE SAML_IdP SHALL set the `SubjectConfirmationData` `NotOnOrAfter` to bound the window during which the assertion may be delivered to the ACS_URL.
5. WHEN delivering a SAML_Response to an ACS_URL, THE SAML_IdP SHALL use only the ACS_URL recorded in the matched SAML_Client_Record and SHALL NOT use an ACS_URL supplied solely by the request that is absent from the record.

### Requirement 12: Multi-Domain (White-Label) Operation

**User Story:** As a white-label customer, I want each custom domain to act as its own SAML IdP, so that my Service Provider trusts an IdP identity on my own domain.

#### Acceptance Criteria

1. THE SAML_IdP SHALL derive the IdP_EntityID, SSO_Endpoint URL, and Metadata_Endpoint URL from the Requesting_Host using the `x-forwarded-host` or `host` headers, allowing each derived value to reflect the current Requesting_Host independently.
2. WHILE running in production, THE SAML_IdP SHALL construct absolute IdP URLs using the `https` scheme; WHILE running in a non-production environment, THE SAML_IdP SHALL honor the `x-forwarded-proto` header and MAY use `http`.
3. WHEN a request is received over HTTP in production, THE SAML_IdP SHALL accept the request and construct outbound IdP URLs using the `https` scheme.
4. WHEN requests arrive on different white-label domains, THE SAML_IdP SHALL produce metadata and SAML_Responses whose IdP identifiers correspond to each respective domain.
5. THE SAML_IdP SHALL set the `Issuer` of each generated SAML_Response and Assertion to the IdP_EntityID of the Requesting_Host on which the AuthnRequest was received.
6. THE SAML_IdP SHALL NOT rely on `request.url` for host derivation, because the reverse proxy presents the application as `127.0.0.1:3000`.
