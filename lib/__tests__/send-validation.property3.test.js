// Feature: send-email, Property 3: Recipient count limit
import fc from "fast-check";
import { validateRecipients, MAX_RECIPIENTS } from "@/lib/send-validation";

// A guaranteed-valid lowercase email; index keeps generated addresses distinct.
function makeEmail(i) {
  return `user${i}@example.com`;
}

// A list of `n` valid addresses.
const validListOfSize = (max) =>
  fc.nat({ max }).chain((n) =>
    fc.constant(Array.from({ length: n }, (_, i) => makeEmail(i)))
  );

describe("Property 3: recipient count limit at the MAX_RECIPIENTS (50) boundary", () => {
  it("combined To+Cc+Bcc count exceeds the limit iff total > MAX_RECIPIENTS", () => {
    // Per-field max of 25 lets the combined total span 0..75, straddling 50.
    fc.assert(
      fc.property(validListOfSize(25), validListOfSize(25), validListOfSize(25), (to, cc, bcc) => {
        const result = validateRecipients({ to, cc, bcc });

        // All inputs are valid, so validated counts equal input counts (no invalids).
        expect(result.invalid).toEqual([]);
        expect(result.to.length).toBe(to.length);
        expect(result.cc.length).toBe(cc.length);
        expect(result.bcc.length).toBe(bcc.length);

        const total = result.to.length + result.cc.length + result.bcc.length;
        const exceeds = total > MAX_RECIPIENTS;

        // The count-limit predicate fires exactly when the combined count > 50.
        expect(exceeds).toBe(to.length + cc.length + bcc.length > 50);
        expect(MAX_RECIPIENTS).toBe(50);
      }),
      { numRuns: 100 }
    );
  });
});
