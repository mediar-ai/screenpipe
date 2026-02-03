import { describe, expect, test } from "bun:test";
import { pipe } from "../src/index";

describe("deduplicateText", () => {
  test("should group similar texts correctly", async () => {
    const texts = [
      "hello world",
      "hello world!",
      "completely different text",
      "hello there world",
      "unique text here",
    ];

    const result = await pipe.deduplicateText(texts);

    expect(result.error).toBeUndefined();
    expect(result.groups).toBeDefined();
    expect(result.groups.length).toBeGreaterThan(0);

    // verify at least one group contains similar hello world variants
    const helloGroup = result.groups.find((g) => g.text.includes("hello"));
    expect(helloGroup).toBeDefined();
    expect(helloGroup?.similar.length).toBeGreaterThan(0);
  });

  test("should handle empty input", async () => {
    const result = await pipe.deduplicateText([]);
    expect(result.groups).toHaveLength(0);
    expect(result.error).toBeUndefined();
  });

  test("should handle single text input", async () => {
    const result = await pipe.deduplicateText(["unique text"]);
    expect(result.groups).toHaveLength(0);
    expect(result.error).toBeUndefined();
  });

  // test("should handle server errors gracefully", async () => {
  //   // Force an error by passing invalid input
  //   const result = await pipe.deduplicateText([null as unknown as string]);
  //   expect(result.error).toBeDefined();
  //   expect(result.groups).toHaveLength(0);
  // });
});
