// Feature: send-email, Property 6: Total size limit accounting
import fc from "fast-check";
import { exceedsSizeLimit, MAX_TOTAL_BYTES } from "@/lib/send-validation";

const LIMIT = 25 * 1024 * 1024; // 26,214,400 bytes

// Small text bodies (their byte sizes nudge totals across the boundary).
const bodyGen = fc.string({ maxLength: 64 });

// Attachment whose size, summed, can straddle 25 MiB.
const attachmentGen = fc.record({
  size: fc.nat({ max: 30 * 1024 * 1024 }),
});

function byteLengthOf(value) {
  if (typeof value !== "string" || value.length === 0) return 0;
  return Buffer.byteLength(value, "utf8");
}

describe("Property 6: total size limit accounting", () => {
  it("is true iff summed subject+body+attachment bytes > 25 MiB", () => {
    fc.assert(
      fc.property(
        bodyGen,
        bodyGen,
        bodyGen,
        fc.array(attachmentGen, { maxLength: 6 }),
        (subject, bodyText, bodyHtml, attachments) => {
          const result = exceedsSizeLimit({ subject, bodyText, bodyHtml, attachments });

          const total =
            byteLengthOf(subject) +
            byteLengthOf(bodyText) +
            byteLengthOf(bodyHtml) +
            attachments.reduce((sum, a) => sum + (a.size > 0 ? a.size : 0), 0);

          expect(MAX_TOTAL_BYTES).toBe(LIMIT);
          expect(result).toBe(total > LIMIT);
        }
      ),
      { numRuns: 100 }
    );
  });
});
