/**
 * SAML Response / Assertion XML construction (pure)
 *
 * Builds an UNSIGNED SAML 2.0 `<samlp:Response>` document containing exactly
 * one `<saml:Assertion>` describing an authenticated Mailbox user. The XML
 * signature is added later by `sign.js`; this module deliberately leaves the
 * signature out and orders the Assertion children so the `<Signature>` can be
 * inserted immediately after the Assertion `<saml:Issuer>` (the position the
 * SAML schema requires).
 *
 * Element ordering is significant and follows the SAML 2.0 schema:
 *   samlp:Response
 *     saml:Issuer
 *     samlp:Status > samlp:StatusCode
 *     saml:Assertion
 *       saml:Issuer            <-- signature is inserted right after this
 *       saml:Subject           (NameID + SubjectConfirmation)
 *       saml:Conditions        (AudienceRestriction)
 *       saml:AuthnStatement    (AuthnContext)
 *       saml:AttributeStatement
 */

const crypto = require("crypto");
const { create } = require("xmlbuilder2");
const { buildAttributes } = require("./attributes");

const PROTOCOL_NS = "urn:oasis:names:tc:SAML:2.0:protocol";
const ASSERTION_NS = "urn:oasis:names:tc:SAML:2.0:assertion";
const STATUS_SUCCESS = "urn:oasis:names:tc:SAML:2.0:status:Success";
const CONFIRMATION_BEARER = "urn:oasis:names:tc:SAML:2.0:cm:bearer";
const AUTHN_CONTEXT_PPT =
  "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport";
const ATTR_NAME_FORMAT_BASIC =
  "urn:oasis:names:tc:SAML:2.0:attrname-format:basic";

// Assertions are valid for 5 minutes (Req 11.2 / 11.4).
const VALIDITY_WINDOW_MS = 5 * 60 * 1000;

/**
 * Build an unsigned SAML Response + Assertion.
 *
 * @param {Object} params
 * @param {string} params.entityId - Host-derived IdP entityID (Response and Assertion Issuer).
 * @param {string} params.acsUrl - Resolved Assertion Consumer Service URL (Destination / Recipient).
 * @param {string} params.inResponseTo - The AuthnRequest request ID.
 * @param {string} params.spEntityId - The SP Issuer (AudienceRestriction audience).
 * @param {{ email: string, name?: string }} params.user - The authenticated Mailbox user.
 * @param {string} params.nameIdFormat - The NameID format to use for the Subject.
 * @param {Object|Map|null|undefined} params.attributeMapping - SP attribute name mapping.
 * @param {Date} [params.now] - Reference instant (defaults to new Date()).
 * @returns {{ xml: string, responseId: string, assertionId: string }}
 */
function buildResponse({
  entityId,
  acsUrl,
  inResponseTo,
  spEntityId,
  user,
  nameIdFormat,
  attributeMapping,
  now,
}) {
  const issueInstant = now instanceof Date ? now : new Date();
  const issueInstantIso = issueInstant.toISOString();
  const notOnOrAfterIso = new Date(
    issueInstant.getTime() + VALIDITY_WINDOW_MS
  ).toISOString();

  const responseId = "_" + crypto.randomUUID();
  const assertionId = "_" + crypto.randomUUID();

  // samlp:Response
  const response = create({ version: "1.0", encoding: "UTF-8" }).ele(
    "samlp:Response",
    {
      "xmlns:samlp": PROTOCOL_NS,
      "xmlns:saml": ASSERTION_NS,
      ID: responseId,
      Version: "2.0",
      IssueInstant: issueInstantIso,
      Destination: acsUrl,
      InResponseTo: inResponseTo,
    }
  );

  // saml:Issuer (Response level)
  response.ele("saml:Issuer").txt(entityId).up();

  // samlp:Status > samlp:StatusCode
  response
    .ele("samlp:Status")
    .ele("samlp:StatusCode", { Value: STATUS_SUCCESS })
    .up() // StatusCode
    .up(); // Status

  // saml:Assertion
  const assertion = response.ele("saml:Assertion", {
    ID: assertionId,
    Version: "2.0",
    IssueInstant: issueInstantIso,
  });

  // saml:Issuer (Assertion level) — MUST be first so the Signature can be
  // inserted immediately after it.
  assertion.ele("saml:Issuer").txt(entityId).up();

  // saml:Subject
  const subject = assertion.ele("saml:Subject");
  subject.ele("saml:NameID", { Format: nameIdFormat }).txt(user.email).up();
  subject
    .ele("saml:SubjectConfirmation", { Method: CONFIRMATION_BEARER })
    .ele("saml:SubjectConfirmationData", {
      InResponseTo: inResponseTo,
      Recipient: acsUrl,
      NotOnOrAfter: notOnOrAfterIso,
    })
    .up() // SubjectConfirmationData
    .up(); // SubjectConfirmation
  subject.up(); // Subject

  // saml:Conditions > saml:AudienceRestriction > saml:Audience
  assertion
    .ele("saml:Conditions", {
      NotBefore: issueInstantIso,
      NotOnOrAfter: notOnOrAfterIso,
    })
    .ele("saml:AudienceRestriction")
    .ele("saml:Audience")
    .txt(spEntityId)
    .up() // Audience
    .up() // AudienceRestriction
    .up(); // Conditions

  // saml:AuthnStatement > saml:AuthnContext > saml:AuthnContextClassRef
  assertion
    .ele("saml:AuthnStatement", {
      AuthnInstant: issueInstantIso,
      SessionIndex: responseId,
    })
    .ele("saml:AuthnContext")
    .ele("saml:AuthnContextClassRef")
    .txt(AUTHN_CONTEXT_PPT)
    .up() // AuthnContextClassRef
    .up() // AuthnContext
    .up(); // AuthnStatement

  // saml:AttributeStatement
  const attributes = buildAttributes(user, attributeMapping);
  const attributeStatement = assertion.ele("saml:AttributeStatement");
  for (const attr of attributes) {
    const attribute = attributeStatement.ele("saml:Attribute", {
      Name: attr.name,
      NameFormat: ATTR_NAME_FORMAT_BASIC,
    });
    for (const value of attr.values) {
      attribute.ele("saml:AttributeValue").txt(value).up();
    }
    attribute.up(); // Attribute
  }
  attributeStatement.up(); // AttributeStatement

  const xml = response.doc().end({ prettyPrint: false });

  return { xml, responseId, assertionId };
}

module.exports = {
  buildResponse,
};
