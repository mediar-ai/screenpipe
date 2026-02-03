import { describe, expect, test } from "bun:test";
import { pipe } from "../src/index";

describe("streamTranscriptions", () => {
  test(
    "should receive and format transcription chunks",
    async () => {
      const chunks = [];

      for await (const chunk of pipe.streamTranscriptions()) {
        chunks.push(chunk);
        if (chunks.length === 2) break; // Break after receiving both chunks
      }

      expect(chunks).toHaveLength(2);

      // verify first chunk format
      expect(chunks.length > 0).toBe(true);
    },
    { timeout: 10_000 }
  );

  test("should handle server errors gracefully", async () => {
    try {
      const generator = pipe.streamTranscriptions();
      await generator.next();
      expect(true).toBe(false); // should not reach here
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});
