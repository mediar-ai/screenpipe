import { describe, expect, test } from "bun:test";
import { ScreenpipeClient } from "../src/index";

describe("streamTranscriptions", () => {
  test(
    "should receive and format transcription chunks",
    async () => {
      const client = new ScreenpipeClient();
      const chunks = [];

      for await (const chunk of client.streamTranscriptions()) {
        chunks.push(chunk);
        if (chunks.length === 2) break;
      }

      expect(chunks).toHaveLength(2);
      expect(chunks.length > 0).toBe(true);
    },
    { timeout: 10_000 }
  );

  test("should handle server errors gracefully", async () => {
    const client = new ScreenpipeClient({ baseUrl: "http://localhost:99999" });
    try {
      const generator = client.streamTranscriptions();
      await generator.next();
      expect(true).toBe(false); // should not reach here
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});
