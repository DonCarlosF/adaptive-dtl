import { describe, it, expect } from "vitest";
import { contentHash } from "./contentHash";

describe("contentHash", () => {
  it("is deterministic for the same input", () => {
    expect(contentHash("hello world")).toBe(contentHash("hello world"));
  });

  it("differs for different inputs", () => {
    expect(contentHash("a")).not.toBe(contentHash("b"));
  });

  it("returns a base36 string", () => {
    expect(contentHash("anything")).toMatch(/^[0-9a-z]+$/);
  });

  it("handles the empty string", () => {
    expect(typeof contentHash("")).toBe("string");
  });
});
