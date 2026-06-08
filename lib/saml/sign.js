/**
 * SAML Assertion XML Digital Signature
 *
 * Signs the `<saml:Assertion>` inside a `<samlp:Response>` in-place using the
 * X.509 signing certificate/key loaded from environment configuration.
 *
 * The signature is computed with:
 *   - RSA-SHA256 signature algorithm
 *     (http://www.w3.org/2001/04/xmldsig-more#rsa-sha256)
 *   - Exclusive XML canonicalization
 *     (http://www.w3.org/2001/10/xml-exc-c14n#)
 *   - Enveloped-signature transform plus exclusive c14n on the reference
 *   - SHA-256 reference digest
 *     (http://www.w3.org/2001/04/xmlenc#sha256)
 *   - A KeyInfo carrying the signing certificate as X509Data/X509Certificate
 *
 * The `<Signature>` element is inserted immediately after the Assertion's
 * `<Issuer>` element, which is the position required by the SAML schema so
 * strict Service Providers (e.g. ChatGPT/WorkOS) accept the document.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

const { SignedXml } = require("xml-crypto");
const { getPrivateKey, getCertDerBase64 } = require("./keys");

const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const EXC_C14N = "http://www.w3.org/2001/10/xml-exc-c14n#";
const ENVELOPED_SIGNATURE =
  "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const SHA256_DIGEST = "http://www.w3.org/2001/04/xmlenc#sha256";

/**
 * Sign the Assertion within a SAML Response XML string in-place.
 *
 * @param {string} responseXml - The unsigned `<samlp:Response>` XML containing
 *   exactly one `<saml:Assertion>` whose `ID` attribute equals `assertionId`.
 * @param {string} assertionId - The Assertion `ID` value; used to build the
 *   signature reference URI (`#${assertionId}`).
 * @returns {string} The signed Response XML, with the assertion signed in-place.
 * @throws {Error} when the signing certificate/key environment variables are missing
 */
function signAssertion(responseXml, assertionId) {
  const privateKey = getPrivateKey();
  const certDerBase64 = getCertDerBase64();

  const sig = new SignedXml({
    privateKey,
    signatureAlgorithm: RSA_SHA256,
    canonicalizationAlgorithm: EXC_C14N,
  });

  // Reference the Assertion by its ID; envelope + exclusive c14n; SHA-256 digest.
  sig.addReference({
    xpath: `//*[local-name(.)='Assertion']`,
    transforms: [ENVELOPED_SIGNATURE, EXC_C14N],
    digestAlgorithm: SHA256_DIGEST,
    uri: `#${assertionId}`,
  });

  // Embed the signing certificate so the SP can validate against metadata.
  // xml-crypto v6 emits the KeyInfo via getKeyInfoContent.
  sig.getKeyInfoContent = () =>
    `<X509Data><X509Certificate>${certDerBase64}</X509Certificate></X509Data>`;

  // Place the Signature immediately after the Assertion's Issuer element
  // (the SAML-schema-required position).
  sig.computeSignature(responseXml, {
    location: {
      reference: `//*[local-name(.)='Assertion']/*[local-name(.)='Issuer']`,
      action: "after",
    },
  });

  return sig.getSignedXml();
}

module.exports = { signAssertion };
