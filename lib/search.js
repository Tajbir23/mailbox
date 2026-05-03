// Build a regex matcher for client-side search. Falls back to escaped literal
// if the user types invalid regex (e.g. an unbalanced "(").
//
//   const match = makeMatcher("foo|bar");
//   match("hello foo", item.tags, item.subject)  // → true if any candidate matches
//
// Empty/whitespace query → matcher returns true for everything.
export function makeMatcher(query) {
  const q = (query ?? "").trim();
  if (!q) return () => true;

  let re;
  try {
    re = new RegExp(q, "i");
  } catch {
    // Invalid regex — escape user input and match as literal substring.
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(escaped, "i");
  }

  return (...candidates) =>
    candidates.some((c) => {
      if (c == null) return false;
      if (Array.isArray(c)) return c.some((x) => x != null && re.test(String(x)));
      return re.test(String(c));
    });
}
