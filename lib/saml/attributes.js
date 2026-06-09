/**
 * SAML Attribute Mapping (pure)
 *
 * Maps a Mailbox User to the list of SAML attributes emitted in an
 * `<saml:AttributeStatement>`. The email attribute is ALWAYS included; the
 * optional name attributes (`givenName`, `surname`) are derived from the
 * user's name and included only when their values are available.
 *
 * The `attributeMapping` argument associates canonical attribute roles
 * (`email`, `givenName`, `surname`) with the SP-facing attribute names. It may
 * be null/undefined, a plain object, or a Mongoose `Map` (which exposes a
 * `.get` function). When absent, default attribute names are used.
 */

// Canonical role -> default SP-facing attribute name.
// Defaults match the attribute names ChatGPT (and most SPs) expect out of the
// box (id / email / firstName / lastName), so no custom mapping is required for
// ChatGPT. An SP that needs different names can override via attribute_mapping.
const DEFAULT_NAMES = {
  id: "id",
  email: "email",
  givenName: "firstName",
  surname: "lastName",
};

/**
 * Normalize the attribute mapping into a lookup function.
 *
 * Handles three shapes:
 *   - null/undefined   -> always returns the default name
 *   - Mongoose Map     -> read via `.get(key)`
 *   - plain object     -> read via property access
 *
 * @param {Object|Map|null|undefined} attributeMapping
 * @returns {(role: string) => string} resolver returning the mapped name or default
 */
function makeResolver(attributeMapping) {
  if (attributeMapping && typeof attributeMapping.get === "function") {
    // Mongoose Map (or any Map-like with a .get accessor).
    return (role) => {
      const mapped = attributeMapping.get(role);
      return mapped != null && mapped !== "" ? mapped : DEFAULT_NAMES[role];
    };
  }

  if (attributeMapping && typeof attributeMapping === "object") {
    // Plain object.
    return (role) => {
      const mapped = attributeMapping[role];
      return mapped != null && mapped !== "" ? mapped : DEFAULT_NAMES[role];
    };
  }

  // No mapping supplied.
  return (role) => DEFAULT_NAMES[role];
}

/**
 * Tokenize a user's name: trim, split on whitespace, drop empty tokens.
 * @param {string|null|undefined} name
 * @returns {string[]}
 */
function tokenizeName(name) {
  if (typeof name !== "string") return [];
  const trimmed = name.trim();
  if (!trimmed) return [];
  return trimmed.split(/\s+/).filter(Boolean);
}

/**
 * Build the SAML attribute list for a user.
 *
 * @param {{ id?: string, email: string, name?: string }} user - The Mailbox User
 * @param {Object|Map|null|undefined} attributeMapping - SP attribute name mapping
 * @returns {Array<{ name: string, values: string[] }>}
 */
function buildAttributes(user, attributeMapping) {
  const resolve = makeResolver(attributeMapping);
  const attributes = [];

  // `id` — a unique, stable identifier for the user. ChatGPT requires this
  // attribute. Use the user's stable id when available, otherwise fall back to
  // the email (ChatGPT explicitly allows mapping email to the id attribute).
  const userId = user && user.id ? String(user.id) : user && user.email;
  if (userId) {
    attributes.push({
      name: resolve("id"),
      values: [userId],
    });
  }

  // Email is always included, even when the mapping omits it.
  attributes.push({
    name: resolve("email"),
    values: [user.email],
  });

  const tokens = tokenizeName(user && user.name);

  // givenName: the first token, when present.
  if (tokens.length >= 1) {
    attributes.push({
      name: resolve("givenName"),
      values: [tokens[0]],
    });
  }

  // surname: remaining tokens joined by a space, when present.
  if (tokens.length >= 2) {
    attributes.push({
      name: resolve("surname"),
      values: [tokens.slice(1).join(" ")],
    });
  }

  return attributes;
}

module.exports = {
  buildAttributes,
};
