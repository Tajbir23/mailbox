// Feature: send-email, Property 2: Recipient validation identifies invalids and normalizes the rest
import fc from "fast-check";
import { validateRecipients } from "@/lib/send-validation";
import { sanitizeEmail } from "@/lib/sanitize";

// Characters that sanitizeEmail accepts in the local part.
const LOCAL_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._%+-".split("");
const DOMAIN_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789-".split("");

// A mostly-valid (often mixed-case) email address.
const validishEmail = fc
  .tuple(
    fc.string({ unit: fc.constantFrom(...LOCAL_CHARS), minLength: 1, maxLength: 12 }),
    fc.string({ unit: fc.constantFrom(...DOMAIN_CHARS), minLength: 1, maxLength: 10 }),
    fc.constantFrom("com", "net", "org", "io", "co", "COM", "Org")
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

// Deliberately malformed strings that sanitizeEmail should reject.
const malformed = fc.oneof(
  fc.string(),
  fc.constantFrom("", "   ", "no-at-sign", "@nope.com", "user@", "user@host", "a@b.c d", "two@@x.com")
);

// A messy address: roughly half valid-looking, half garbage, sometimes case-shuffled.
const messyEmail = fc.oneof(
  { weight: 3, arbitrary: validishEmail },
  { weight: 2, arbitrary: malformed }
);

const recipientList = fc.array(messyEmail, { maxLength: 8 });

describe("Property 2: validateRecipients identifies invalids and normalizes the rest", () => {
  it("invalid == exactly the sanitizeEmail-rejected inputs; accepted == lowercased sanitizeEmail", () => {
    fc.assert(
      fc.property(recipientList, recipientList, recipientList, (to, cc, bcc) => {
        const result = validateRecipients({ to, cc, bcc });

        // Build the expected accepted/invalid partition independently via sanitizeEmail.
        const expected = { to: [], cc: [], bcc: [], invalid: [] };
        for (const field of ["to", "cc", "bcc"]) {
          const list = { to, cc, bcc }[field];
          for (const value of list) {
            const clean = sanitizeEmail(value);
            if (clean === "") expected.invalid.push({ field, value });
            else expected[field].push(clean);
          }
        }

        // invalid collection equals exactly the rejected subset (same field/value/order).
        expect(result.invalid).toEqual(expected.invalid);

        // Every accepted address equals its lowercased sanitizeEmail output.
        for (const field of ["to", "cc", "bcc"]) {
          expect(result[field]).toEqual(expected[field]);
          for (const addr of result[field]) {
            expect(addr).toBe(sanitizeEmail(addr));
            expect(addr).toBe(addr.toLowerCase());
            expect(sanitizeEmail(addr)).not.toBe("");
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
