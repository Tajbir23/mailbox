// Feature: send-email, Property 11: Pagination clamp
import fc from "fast-check";
import { clampLimit, shapeSentResults, MAX_LIMIT } from "@/lib/sent-query";

// Arbitrary limit inputs: missing, zero, negative, huge, fractional, and
// non-numeric values all flow through the same clamp.
const limitArb = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.constant(0),
  fc.integer({ min: -1000, max: -1 }),
  fc.integer({ min: 1, max: 100000 }),
  fc.float({ min: Math.fround(-50), max: Math.fround(50000), noNaN: true }),
  fc.constantFrom("10", "0", "-5", "1000", "abc", "", "  ", "3.9", "NaN")
);

const sentRecord = fc.record({
  mailboxId: fc.constant("mbx"),
  createdAt: fc.integer({ min: 0, max: 4102444800000 }),
});

describe("Property 11: Pagination clamp", () => {
  it("clampLimit returns an integer in [1, 100]", () => {
    fc.assert(
      fc.property(limitArb, (limit) => {
        const clamped = clampLimit(limit);
        expect(Number.isInteger(clamped)).toBe(true);
        expect(clamped).toBeGreaterThanOrEqual(1);
        expect(clamped).toBeLessThanOrEqual(MAX_LIMIT);
      }),
      { numRuns: 100 }
    );
  });

  it("shapeSentResults returns at most 100 and at most the clamped limit", () => {
    fc.assert(
      fc.property(
        fc.array(sentRecord, { maxLength: 250 }),
        limitArb,
        fc.integer({ min: 1, max: 5 }),
        (records, limit, page) => {
          const clamped = clampLimit(limit);
          const result = shapeSentResults(records, { page, limit });

          expect(result.length).toBeLessThanOrEqual(MAX_LIMIT);
          expect(result.length).toBeLessThanOrEqual(clamped);
        }
      ),
      { numRuns: 100 }
    );
  });
});
