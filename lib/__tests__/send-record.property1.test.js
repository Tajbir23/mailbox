// Feature: send-email, Property 1: Sender identity is always the mailbox address
import fc from "fast-check";
import { buildSentEmailRecord } from "@/lib/send-record";

// A mailbox always carries an `_id` and an `emailAddress`. The emailAddress is
// the only legitimate sender identity; nothing in the payload may override it.
const mailboxArb = fc.record({
  _id: fc.oneof(
    fc.string({ minLength: 1, maxLength: 24 }),
    fc.integer({ min: 1, max: 1_000_000 })
  ),
  emailAddress: fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 12 }),
      fc.constantFrom("example.com", "mail.test", "genuinesoftmart.com", "co.uk")
    )
    .map(([local, domain]) => `${local}@${domain}`),
});

// An arbitrary client-supplied `from` — including spoofed addresses, empty
// strings, non-string junk, or no `from` field at all.
const spoofedFrom = fc.oneof(
  fc.string(),
  fc.constantFrom(
    "attacker@evil.com",
    "ceo@victim-bank.com",
    "",
    "   ",
    "not-an-email"
  ),
  fc.integer(),
  fc.boolean(),
  fc.constant(undefined),
  fc.constant(null)
);

// A payload that may or may not include a (spoofed) `from`.
const payloadArb = fc.oneof(
  fc.record({ from: spoofedFrom }),
  fc.record({ subject: fc.string(), body: fc.string() }),
  fc.constant(undefined),
  fc.constant({})
);

describe("Property 1: Sender identity is always the mailbox address", () => {
  it("record.from and envelopeFrom always equal mailbox.emailAddress, regardless of payload.from", () => {
    fc.assert(
      fc.property(mailboxArb, payloadArb, (mailbox, payload) => {
        const { record, envelopeFrom } = buildSentEmailRecord({
          mailbox,
          userId: "user-123",
          payload,
          normalizedRecipients: { to: ["dest@example.com"], cc: [], bcc: [] },
          subject: "Subject",
          bodyText: "Body",
          bodyHtml: "<p>Body</p>",
          attachments: [],
          inReplyToEmailId: null,
        });

        // The persisted header sender and the delivery envelope sender both
        // equal the mailbox address — never the client-supplied `from`.
        expect(record.from).toBe(mailbox.emailAddress);
        expect(envelopeFrom).toBe(mailbox.emailAddress);
      }),
      { numRuns: 100 }
    );
  });
});
