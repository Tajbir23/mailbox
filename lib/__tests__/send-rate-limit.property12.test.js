// Feature: send-email, Property 12: Rate-limit counting
//
// **Property 12** — **Validates: Requirements 9.1, 9.2**
//
// For any token (user or mailbox) and configured limit N, the first N send
// checks within a window are allowed and every subsequent check within the
// same window is rejected.

import fc from "fast-check";
import { checkSendLimit, _resetSendLimits } from "../send-rate-limit.js";

// A large window so it never expires mid-test, isolating the *counting*
// behaviour from window-reset behaviour (Property 13 covers retry timing).
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Unique-token suffix counter so windows from different fast-check runs never
// collide in the shared in-memory Map.
let runCounter = 0;

describe("Property 12: Rate-limit counting", () => {
  beforeEach(() => {
    _resetSendLimits();
  });

  it("allows the first N checks and rejects every subsequent check within the window", () => {
    fc.assert(
      fc.property(
        // limit N in a reasonable range
        fc.integer({ min: 1, max: 20 }),
        // how many extra checks to make past the limit
        fc.integer({ min: 1, max: 15 }),
        (limit, extra) => {
          // Fresh, unique token per run so prior runs cannot leak state.
          const token = `user:p12-${runCounter++}-${Math.random().toString(36).slice(2)}`;

          // The first N checks must all be allowed.
          for (let i = 0; i < limit; i++) {
            const res = checkSendLimit(token, { limit, windowMs: WINDOW_MS });
            expect(res.allowed).toBe(true);
            expect(res.retryAfter).toBe(0);
          }

          // Every subsequent check within the same window must be rejected.
          for (let i = 0; i < extra; i++) {
            const res = checkSendLimit(token, { limit, windowMs: WINDOW_MS });
            expect(res.allowed).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
