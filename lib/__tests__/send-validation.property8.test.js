// Feature: send-email, Property 8: Reply/forward subject prefixing is single and idempotent
import fc from "fast-check";
import { prefixSubject } from "@/lib/send-validation";

// Canonical prefixes the pipeline applies.
const canonicalPrefix = fc.constantFrom("Re: ", "Fwd: ");

// Case variants of the prefixes (the dedupe check is case-insensitive).
const prefixVariant = fc.constantFrom("Re: ", "RE: ", "re: ", "Fwd: ", "FWD: ", "fwd: ");

// A subject that already carries zero, one, or repeated prefixes.
const prefixedSubject = fc
  .tuple(fc.array(prefixVariant, { maxLength: 3 }), fc.string({ maxLength: 30 }))
  .map(([prefixes, base]) => prefixes.join("") + base);

describe("Property 8: subject prefixing is single and idempotent", () => {
  it("adds exactly one prefix (no double-prefixing) and is idempotent", () => {
    fc.assert(
      fc.property(prefixedSubject, canonicalPrefix, (subject, prefix) => {
        const result = prefixSubject(subject, prefix);
        const alreadyPrefixed = subject.toLowerCase().startsWith(prefix.toLowerCase());

        // Result always begins with the prefix (case-insensitive).
        expect(result.toLowerCase().startsWith(prefix.toLowerCase())).toBe(true);

        // No double-prefixing: prepend exactly once only when not already present.
        if (alreadyPrefixed) {
          expect(result).toBe(subject);
        } else {
          expect(result).toBe(prefix + subject);
        }

        // Idempotent: applying again leaves the result unchanged.
        expect(prefixSubject(result, prefix)).toBe(result);
      }),
      { numRuns: 100 }
    );
  });
});
