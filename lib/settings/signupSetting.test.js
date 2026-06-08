import { resolveSignupEnabled } from "@/lib/settings/signupSetting";

describe("resolveSignupEnabled", () => {
  it("returns the boolean value when given a boolean", () => {
    expect(resolveSignupEnabled(true)).toBe(true);
    expect(resolveSignupEnabled(false)).toBe(false);
  });

  it("defaults to true when value is missing", () => {
    expect(resolveSignupEnabled(undefined)).toBe(true);
    expect(resolveSignupEnabled(null)).toBe(true);
  });

  it("defaults to true for non-boolean values", () => {
    expect(resolveSignupEnabled("true")).toBe(true);
    expect(resolveSignupEnabled(0)).toBe(true);
    expect(resolveSignupEnabled(1)).toBe(true);
    expect(resolveSignupEnabled({})).toBe(true);
    expect(resolveSignupEnabled([])).toBe(true);
  });
});
