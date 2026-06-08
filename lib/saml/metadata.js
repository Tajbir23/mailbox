/**
 * SAML IdP Metadata XML construction (pure)
 *
 * Builds a SAML 2.0 `<md:EntityDescriptor>` document describing this Mailbox
 * SAML Identity Provider for a given host-derived `entityID`. The metadata is
 * served from the Metadata_Endpoint so Service Providers can configure trust.
 *
 * The document follows the SAML metadata schema element order for
 * `IDPSSODescriptor`: `KeyDescriptor` first, then `NameIDFormat`, then the
 * `SingleSignOnService` endpoints.
 */

const { create } = require("xmlbuilder2");

const MD_NS = "urn:oasis:names:tc:SAML:2.0:metadata";
const DS_NS = "http://www.w3.org/2000/09/xmldsig#";
const PROTOCOL_NS = "urn:oasis:names:tc:SAML:2.0:protocol";
const NAMEID_EMAIL = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress";
const BINDING_REDIRECT = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect";
const BINDING_POST = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST";

/**
 * Build the IdP metadata XML string.
 *
 * @param {Object} params
 * @param {string} params.entityId - The host-derived IdP entityID.
 * @param {string} params.ssoUrl - The Single Sign-On service endpoint URL.
 * @param {string} params.certDerBase64 - Single-line base64 DER body of the
 *   signing X.509 certificate (no PEM header/footer).
 * @returns {string} The metadata XML document.
 */
function buildMetadata({ entityId, ssoUrl, certDerBase64 }) {
  const doc = create({ version: "1.0", encoding: "UTF-8" })
    .ele("md:EntityDescriptor", {
      "xmlns:md": MD_NS,
      "xmlns:ds": DS_NS,
      entityID: entityId,
    })
    .ele("md:IDPSSODescriptor", {
      protocolSupportEnumeration: PROTOCOL_NS,
      WantAuthnRequestsSigned: "false",
    });

  // 1. KeyDescriptor (signing) with the embedded X.509 certificate.
  doc
    .ele("md:KeyDescriptor", { use: "signing" })
    .ele("ds:KeyInfo")
    .ele("ds:X509Data")
    .ele("ds:X509Certificate")
    .txt(certDerBase64)
    .up() // X509Certificate
    .up() // X509Data
    .up() // KeyInfo
    .up(); // KeyDescriptor

  // 2. NameIDFormat.
  doc.ele("md:NameIDFormat").txt(NAMEID_EMAIL).up();

  // 3. SingleSignOnService entries (HTTP-Redirect, then HTTP-POST).
  doc
    .ele("md:SingleSignOnService", {
      Binding: BINDING_REDIRECT,
      Location: ssoUrl,
    })
    .up();

  doc
    .ele("md:SingleSignOnService", {
      Binding: BINDING_POST,
      Location: ssoUrl,
    })
    .up();

  return doc.end({ prettyPrint: false });
}

module.exports = {
  buildMetadata,
};
