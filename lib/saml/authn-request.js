/**
 * SAML AuthnRequest decoding and parsing.
 *
 * Handles the two SP-initiated SSO bindings:
 *   - HTTP-Redirect: the `SAMLRequest` query parameter is base64-decoded then
 *     DEFLATE-inflated (raw, no zlib header) via `zlib.inflateRawSync`.
 *   - HTTP-POST: the `SAMLRequest` form field is base64-decoded only.
 *
 * Parsing uses `@xmldom/xmldom`'s DOMParser. The extracted shape is:
 *   { id, issuer, acsUrl, destination }
 *
 * Any absent, malformed, or unparseable input raises `AuthnRequestError` so the
 * SSO route can return an HTTP 400 response without generating a SAML_Response.
 */

const zlib = require("zlib");
const { DOMParser } = require("@xmldom/xmldom");

/**
 * Typed error thrown for any AuthnRequest decode/parse failure.
 * The SSO route detects this to return HTTP 400.
 */
class AuthnRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthnRequestError";
  }
}

/**
 * Decode a `SAMLRequest` carried via the HTTP-Redirect binding.
 * Base64-decode, then raw-DEFLATE inflate to recover the XML string.
 *
 * @param {string} samlRequestParam - The raw `SAMLRequest` query parameter value.
 * @returns {string} The decoded AuthnRequest XML.
 * @throws {AuthnRequestError} If the value is absent or cannot be decoded/inflated.
 */
function decodeRedirect(samlRequestParam) {
  if (!samlRequestParam || typeof samlRequestParam !== "string") {
    throw new AuthnRequestError("SAMLRequest parameter is missing");
  }

  let xml;
  try {
    const compressed = Buffer.from(samlRequestParam, "base64");
    xml = zlib.inflateRawSync(compressed).toString("utf-8");
  } catch (err) {
    throw new AuthnRequestError(
      `Failed to base64-decode/inflate SAMLRequest (HTTP-Redirect): ${err.message}`
    );
  }

  if (!xml) {
    throw new AuthnRequestError("Decoded SAMLRequest (HTTP-Redirect) is empty");
  }
  return xml;
}

/**
 * Decode a `SAMLRequest` carried via the HTTP-POST binding.
 * Base64-decode only to recover the XML string.
 *
 * @param {string} samlRequestField - The raw `SAMLRequest` form field value.
 * @returns {string} The decoded AuthnRequest XML.
 * @throws {AuthnRequestError} If the value is absent or cannot be decoded.
 */
function decodePost(samlRequestField) {
  if (!samlRequestField || typeof samlRequestField !== "string") {
    throw new AuthnRequestError("SAMLRequest field is missing");
  }

  let xml;
  try {
    xml = Buffer.from(samlRequestField, "base64").toString("utf-8");
  } catch (err) {
    throw new AuthnRequestError(
      `Failed to base64-decode SAMLRequest (HTTP-POST): ${err.message}`
    );
  }

  if (!xml) {
    throw new AuthnRequestError("Decoded SAMLRequest (HTTP-POST) is empty");
  }
  return xml;
}

/**
 * Find the first element with the given local name regardless of namespace prefix.
 *
 * @param {Document|Element} node - The DOM node to search within.
 * @param {string} localName - The local element name (e.g. "Issuer").
 * @returns {Element|null}
 */
function firstByLocalName(node, localName) {
  // getElementsByTagNameNS with "*" namespace matches any prefix/namespace.
  const els = node.getElementsByTagNameNS("*", localName);
  return els && els.length > 0 ? els[0] : null;
}

/**
 * Parse a SAML AuthnRequest XML string into a structured object.
 *
 * @param {string} xmlString - The decoded AuthnRequest XML.
 * @returns {{ id: string, issuer: string, acsUrl: string|null, destination: string|null }}
 * @throws {AuthnRequestError} If the XML is empty, unparseable, or missing the
 *   AuthnRequest root, an ID, or an Issuer.
 */
function parseAuthnRequest(xmlString) {
  if (!xmlString || typeof xmlString !== "string" || xmlString.trim() === "") {
    throw new AuthnRequestError("AuthnRequest XML is empty");
  }

  let doc;
  try {
    doc = new DOMParser({
      // Swallow non-fatal warnings/errors; we validate the result below.
      onError: () => {},
    }).parseFromString(xmlString, "text/xml");
  } catch (err) {
    throw new AuthnRequestError(`Failed to parse AuthnRequest XML: ${err.message}`);
  }

  if (!doc || !doc.documentElement) {
    throw new AuthnRequestError("AuthnRequest XML has no document element");
  }

  const root = doc.documentElement;
  if (root.localName !== "AuthnRequest") {
    throw new AuthnRequestError(
      `Expected AuthnRequest root element, found "${root.localName || root.nodeName}"`
    );
  }

  const id = root.getAttribute("ID");
  if (!id) {
    throw new AuthnRequestError("AuthnRequest is missing the ID attribute");
  }

  const issuerEl = firstByLocalName(root, "Issuer");
  const issuer = issuerEl ? (issuerEl.textContent || "").trim() : "";
  if (!issuer) {
    throw new AuthnRequestError("AuthnRequest is missing the Issuer element");
  }

  // AssertionConsumerServiceURL and Destination are optional.
  const acsUrl = root.getAttribute("AssertionConsumerServiceURL") || null;
  const destination = root.getAttribute("Destination") || null;

  return { id, issuer, acsUrl, destination };
}

module.exports = {
  AuthnRequestError,
  decodeRedirect,
  decodePost,
  parseAuthnRequest,
};
