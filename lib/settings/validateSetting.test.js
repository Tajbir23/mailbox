import { isValidSettingValue } from "@/lib/settings/validateSetting";

describe("isValidSettingValue", () => {
  it("validates boolean type definitions", () => {
    const def = { type: "boolean" };
    expect(isValidSettingValue(def, true)).toBe(true);
    expect(isValidSettingValue(def, false)).toBe(true);
    expect(isValidSettingValue(def, "true")).toBe(false);
    expect(isValidSettingValue(def, 1)).toBe(false);
    expect(isValidSettingValue(def, null)).toBe(false);
    expect(isValidSettingValue(def, {})).toBe(false);
    expect(isValidSettingValue(def, [])).toBe(false);
  });

  it("validates allowed-list definitions", () => {
    const def = { allowed: ["public", "admin"] };
    expect(isValidSettingValue(def, "public")).toBe(true);
    expect(isValidSettingValue(def, "admin")).toBe(true);
    expect(isValidSettingValue(def, "private")).toBe(false);
  });

  it("returns false when definition is missing", () => {
    expect(isValidSettingValue(undefined, true)).toBe(false);
  });

  it("returns true when definition has no constraints", () => {
    expect(isValidSettingValue({}, "anything")).toBe(true);
  });
});
