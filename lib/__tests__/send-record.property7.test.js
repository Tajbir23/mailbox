// Feature: send-email, Property 7: Attachment metadata preservation
import fc from "fast-check";
import { buildSentEmailRecord } from "@/lib/send-record";

// A single attachment carries the metadata that must survive into the stored
// record: `filename`, `contentType`, and an explicit finite numeric `size`.
const attachmentArb = fc.record({
  filename: fc.string({ minLength: 1, maxLength: 40 }),
  contentType: fc.constantFrom(
    "text/plain",
    "application/pdf",
    "image/png",
    "image/jpeg",
    "application/octet-stream",
    "text/html"
  ),
  // A finite, non-negative byte size. Using a finite double guarantees the
  // helper keeps the explicit value rather than deriving from content length.
  size: fc.integer({ min: 0, max: 25 * 1024 * 1024 }),
});

const attachmentsArb = fc.array(attachmentArb, { maxLength: 10 });

const mailbox = { _id: "mbx-1", emailAddress: "sender@example.com" };

describe("Property 7: Attachment metadata preservation", () => {
  it("each stored attachment preserves input filename, contentType, and size exactly", () => {
    fc.assert(
      fc.property(attachmentsArb, (attachments) => {
        const { record } = buildSentEmailRecord({
          mailbox,
          userId: "user-123",
          payload: {},
          normalizedRecipients: { to: ["dest@example.com"], cc: [], bcc: [] },
          subject: "Subject",
          bodyText: "Body",
          bodyHtml: "<p>Body</p>",
          attachments,
          inReplyToEmailId: null,
        });

        expect(record.attachments).toHaveLength(attachments.length);

        attachments.forEach((input, i) => {
          const stored = record.attachments[i];
          expect(stored.filename).toBe(input.filename);
          expect(stored.contentType).toBe(input.contentType);
          expect(stored.size).toBe(input.size);
        });
      }),
      { numRuns: 100 }
    );
  });
});
