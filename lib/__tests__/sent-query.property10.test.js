// Feature: send-email, Property 10: Sent retrieval ordering
import fc from "fast-check";
import { shapeSentResults } from "@/lib/sent-query";

// Mirror of sent-query's internal createdAtValue: tolerant comparable timestamp
// for Date / number / ISO-string / missing values (unparseable sorts as 0).
function createdAtValue(record) {
  const raw = record ? record.createdAt : undefined;
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (typeof raw === "string") {
    const t = Date.parse(raw);
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

// createdAt expressed in several shapes the route may encounter.
const createdAt = fc.oneof(
  fc.date({ min: new Date(0), max: new Date(4102444800000), noInvalidDate: true }),
  fc.integer({ min: 0, max: 4102444800000 }),
  fc
    .date({ min: new Date(0), max: new Date(4102444800000), noInvalidDate: true })
    .map((d) => d.toISOString())
);

const sentRecord = fc.record({
  mailboxId: fc.constant("mbx"),
  createdAt,
  subject: fc.string({ maxLength: 20 }),
});

describe("Property 10: Sent retrieval ordering", () => {
  it("results are ordered by createdAt non-increasing (most recent first)", () => {
    fc.assert(
      fc.property(
        fc.array(sentRecord, { maxLength: 60 }),
        // A large limit so the whole set is returned and fully ordered.
        fc.constant(100),
        (records, limit) => {
          const result = shapeSentResults(records, { page: 1, limit });

          for (let i = 1; i < result.length; i++) {
            const prev = createdAtValue(result[i - 1]);
            const curr = createdAtValue(result[i]);
            expect(prev).toBeGreaterThanOrEqual(curr);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
