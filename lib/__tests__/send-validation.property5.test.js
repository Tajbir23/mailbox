// Feature: send-email, Property 5: Empty-content detection
import fc from "fast-check";
import { isContentEmpty } from "@/lib/send-validation";

// Mix of blank (empty/whitespace) and non-blank field values.
const fieldGen = fc.oneof(
  fc.constantFrom("", "   ", "\t", "\n", "  \n\t "),
  fc.constant(undefined),
  fc.constant(null),
  fc.string({ minLength: 1 }),
  fc.string({ minLength: 1 }).map((s) => `  ${s}  `)
);

function isBlank(value) {
  if (typeof value !== "string") return value === undefined || value === null;
  return value.trim().length === 0;
}

describe("Property 5: empty-content detection", () => {
  it("is true iff subject AND both bodies are empty/whitespace", () => {
    fc.assert(
      fc.property(fieldGen, fieldGen, fieldGen, (subject, bodyText, bodyHtml) => {
        const result = isContentEmpty({ subject, bodyText, bodyHtml });
        const expected = isBlank(subject) && isBlank(bodyText) && isBlank(bodyHtml);
        expect(result).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });
});
