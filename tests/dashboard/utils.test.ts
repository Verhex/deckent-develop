import { describe, it, expect } from "vitest";
import { cn } from "../../src/dashboard/src/lib/utils.js";

describe("dashboard/lib/utils", () => {
  describe("cn()", () => {
    it("merges class names", () => {
      expect(cn("foo", "bar")).toBe("foo bar");
    });

    it("handles conditional classes via clsx", () => {
      expect(cn("base", false && "hidden", "extra")).toBe("base extra");
    });

    it("deduplicates tailwind classes via twMerge", () => {
      expect(cn("p-4", "p-6")).toBe("p-6");
    });

    it("handles undefined and null inputs", () => {
      expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
    });

    it("returns empty string for no inputs", () => {
      expect(cn()).toBe("");
    });

    it("handles array inputs", () => {
      expect(cn(["foo", "bar"])).toBe("foo bar");
    });

    it("handles object inputs", () => {
      expect(cn({ foo: true, bar: false, baz: true })).toBe("foo baz");
    });

    it("merges conflicting tailwind utilities", () => {
      expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
    });
  });
});
