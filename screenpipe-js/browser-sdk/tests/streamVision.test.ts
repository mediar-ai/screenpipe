import { describe, expect, test } from "bun:test";
import { pipe } from "../src/index";

describe("streamVision", () => {
  test(
    "should receive and format vision events without images",
    async () => {
      const events = [];

      for await (const event of pipe.streamVision()) {
        events.push(event);
        if (events.length === 2) break; // Break after receiving two events
      }

      expect(events).toHaveLength(2);

      // verify event format
      expect(events[0]).toHaveProperty("type", "vision_stream");
      expect(events[0].data).toHaveProperty("text");
      expect(events[0].data).toHaveProperty("timestamp");
      expect(events[0].data.image || undefined).toBeUndefined(); // images disabled by default
    },
    { timeout: 15_000 }
  );

  test(
    "should receive and format vision events with images",
    async () => {
      const events = [];

      for await (const event of pipe.streamVision(true)) {
        events.push(event);
        if (events.length === 2) break; // Break after receiving two events
      }

      expect(events).toHaveLength(2);

      // verify event format with images
      expect(events[0]).toHaveProperty("type", "vision_stream");
      expect(events[0].data).toHaveProperty("text");
      expect(events[0].data).toHaveProperty("timestamp");
      expect(events[0].data).toHaveProperty("image");
      expect(typeof events[0].data.image).toBe("string");
    },
    { timeout: 10_000 }
  );

  test("should handle server errors gracefully", async () => {
    try {
      const generator = pipe.streamVision();
      await generator.next();
      expect(true).toBe(false); // should not reach here
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});
