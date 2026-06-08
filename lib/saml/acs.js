/**
 * SAML ACS (Assertion Consumer Service) Resolution
 *
 * Pure decision logic that, given a loaded SAMLClient record and the ACS URL
 * requested in an AuthnRequest, determines whether the IdP may proceed and
 * which ACS URL the signed SAML_Response must be delivered to.
 *
 * SECURITY: the resolved ACS URL is ALWAYS one recorded on the client (either
 * in `acs_urls` or as `default_acs_url`). An ACS URL supplied only by the
 * request and absent from the record is never used as the POST target. This
 * prevents the IdP from being abused as an open relay.
 */

/**
 * Resolve the SP client and the ACS URL to use for the SAML_Response.
 *
 * Decision table:
 *   - client null/undefined OR inactive          -> { ok: false, reason: "unknown_sp" }
 *   - requested ACS present, not allow-listed     -> { ok: false, reason: "acs_not_allowed" }
 *   - requested ACS present, allow-listed         -> { ok: true, acsUrl: requestedAcsUrl }
 *   - requested ACS absent, default_acs_url set   -> { ok: true, acsUrl: default_acs_url }
 *   - requested ACS absent, no default            -> { ok: false, reason: "no_acs" }
 *
 * @param {object|null|undefined} client - Loaded SAMLClient record (or null/undefined)
 * @param {string|null|undefined} requestedAcsUrl - ACS URL from the AuthnRequest
 * @returns {{ ok: true, acsUrl: string } | { ok: false, reason: string }}
 */
function resolveClientAndAcs(client, requestedAcsUrl) {
  // Unknown or inactive SP.
  if (!client || client.active === false) {
    return { ok: false, reason: "unknown_sp" };
  }

  // Normalize the allow-list (Mongoose docs expose acs_urls directly).
  const acsUrls = Array.isArray(client.acs_urls) ? client.acs_urls : [];

  if (requestedAcsUrl) {
    // A specific ACS URL was requested: it must be on the record allow-list.
    if (!acsUrls.includes(requestedAcsUrl)) {
      return { ok: false, reason: "acs_not_allowed" };
    }
    return { ok: true, acsUrl: requestedAcsUrl };
  }

  // No ACS URL requested: fall back to the record's default, if any.
  if (client.default_acs_url) {
    return { ok: true, acsUrl: client.default_acs_url };
  }

  return { ok: false, reason: "no_acs" };
}

module.exports = {
  resolveClientAndAcs,
};
