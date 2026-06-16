// Feature: send-email, Property 4: Subject normalization
import fc from "fast-check";
import { normalizeSubject, MAX_SUBJECT } from "@/lib/send-validation";

const DEFAULT_SUBJECT = "(No Subject)";

// Whitespace-only strings (should normalize to the default subject).
const whitespaceOnly = fc.string({
  unit: fc.constantFrom(" ", "\t", "\n", "\r", "\f", "\v"),
  maxLength: 10,
});

// Subjects whose length straddles the 998-char boundary.
const boundarySubject = fc
  .integer({ min: 990, max: 1010 })
  .chain((len) => fc.constant("a".repeat(len)));

const subjectGen = fc.oneof(
  whitespaceOnly,
  boundarySubject,
  fc.string(),
  // Padded content: trims to non-empty, exercises the cap path.
  fc.string({ minLength: 1 }).map((s) => `   ${s}   `)
);

describe("Property 4: subject normalization", () => {
  it("returns '(No Subject)' for empty/whitespace, else trimmed length <= 998", () => {
    fc.assert(
      fc.property(subjectGen, (subject) => {
        const result = normalizeSubject(subject);
        const trimmed = typeof subject === "string" ? subject.trim() : "";

        if (trimmed.length === 0) {
          expect(result).toBe(DEFAULT_SUBJECT);
        } else {
          expect(result.length).toBeLessThanOrEqual(MAX_SUBJECT);
          expect(MAX_SUBJECT).toBe(998);
          // Non-empty result is the trimmed subject capped at 998 chars.
          expect(result).toBe(trimmed.slice(0, MAX_SUBJECT));
        }
      }),
      { numRuns: 100 }
    );
  });
});
