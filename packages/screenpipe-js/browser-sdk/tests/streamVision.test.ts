import { describe, expect, test } from "bun:test";
import { ScreenpipeClient } from "../src/index";

describe("streamVision", () => {
  test(
    "should receive and format vision events without images",
    async () => {
      const client = new ScreenpipeClient();
      const events = [];

      for await (const event of client.streamVision()) {
        events.push(event);
        if (events.length === 2) break;
      }

      expect(events).toHaveLength(2);
      expect(events[0]).toHaveProperty("type");
      expect(events[0].data).toHaveProperty("text");
      expect(events[0].data).toHaveProperty("timestamp");
    },
    { timeout: 15_000 }
  );

  test(
    "should receive and format vision events with images",
    async () => {
      const client = new ScreenpipeClient();
      const events = [];

      for await (const event of client.streamVision(true)) {
        events.push(event);
        if (events.length === 2) break;
      }

      expect(events).toHaveLength(2);
      expect(events[0]).toHaveProperty("type");
      expect(events[0].data).toHaveProperty("text");
      expect(events[0].data).toHaveProperty("timestamp");
      expect(events[0].data).toHaveProperty("image");
      expect(typeof events[0].data.image).toBe("string");
    },
    { timeout: 10_000 }
  );

  test("should handle server errors gracefully", async () => {
    const client = new ScreenpipeClient({ baseUrl: "http://localhost:99999" });
    try {
      const generator = client.streamVision();
      await generator.next();
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});
