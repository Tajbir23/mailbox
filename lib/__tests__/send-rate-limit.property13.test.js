// Feature: send-email, Property 13: Retry-after on rate-limit rejection
//
// **Property 13** — **Validates: Requirements 9.3**
//
// For any rate-limit rejection, the returned `retryAfter` is greater than 0 and
// less than or equal to the configured window length (in seconds).

import fc from "fast-check";
import { checkSendLimit, _resetSendLimits } from "../send-rate-limit.js";

// Unique-token suffix counter so windows from different fast-check runs never
// collide in the shared in-memory Map.
let runCounter = 0;

describe("Property 13: Retry-after on rate-limit rejection", () => {
  beforeEach(() => {
    _resetSendLimits();
  });

  it("returns 0 < retryAfter <= windowMs/1000 on any rejection", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }), // limit N
        fc.integer({ min: 1, max: 10 }), // number of rejections to inspect
        // window length in seconds (kept large enough that it cannot expire
        // mid-test), then converted to ms.
        fc.integer({ min: 1, max: 7200 }),
        (limit, rejections, windowSeconds) => {
          const windowMs = windowSeconds * 1000;
          const token = `mbx:p13-${runCounter++}-${Math.random().toString(36).slice(2)}`;

          // Exhaust the limit first (these are all allowed).
          for (let i = 0; i < limit; i++) {
            checkSendLimit(token, { limit, windowMs });
          }

          const maxSeconds = windowMs / 1000;

          // Now every further check is a rejection; assert the retry-after bound.
          for (let i = 0; i < rejections; i++) {
            const res = checkSendLimit(token, { limit, windowMs });
            expect(res.allowed).toBe(false);
            expect(res.retryAfter).toBeGreaterThan(0);
            expect(res.retryAfter).toBeLessThanOrEqual(maxSeconds);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
