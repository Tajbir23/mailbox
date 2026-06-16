// Feature: send-email, Property 9: Sent retrieval is scoped to the mailbox
import fc from "fast-check";
import { buildSentFilter, shapeSentResults } from "@/lib/sent-query";

// A small pool of distinct mailbox ids so generated records naturally span
// multiple mailboxes and collisions with the requested mailbox are likely.
const mailboxId = fc.constantFrom("mbxA", "mbxB", "mbxC", "mbxD");

const sentRecord = fc.record({
  mailboxId,
  // createdAt varied so sort/clamp also exercise this set realistically.
  createdAt: fc.oneof(
    fc.date({ min: new Date(0), max: new Date(4102444800000), noInvalidDate: true }),
    fc.integer({ min: 0, max: 4102444800000 }),
    fc
      .date({ min: new Date(0), max: new Date(4102444800000), noInvalidDate: true })
      .map((d) => d.toISOString())
  ),
  subject: fc.string({ maxLength: 20 }),
});

// Apply buildSentFilter semantics at the "DB layer": keep only records whose
// mailboxId matches the filter, exactly as the route's query does, before
// handing the already-scoped set to shapeSentResults.
function applyFilter(records, filter) {
  return records.filter((r) => r.mailboxId === filter.mailboxId);
}

describe("Property 9: Sent retrieval is scoped to the mailbox", () => {
  it("every returned record has the requested mailboxId", () => {
    fc.assert(
      fc.property(
        fc.array(sentRecord, { maxLength: 60 }),
        mailboxId,
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 150 }),
        (records, requestedMailboxId, page, limit) => {
          const filter = buildSentFilter(requestedMailboxId);
          const scoped = applyFilter(records, filter);

          const result = shapeSentResults(scoped, { page, limit });

          for (const record of result) {
            expect(record.mailboxId).toBe(requestedMailboxId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
