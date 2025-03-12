import { describe, expect, test } from "bun:test";
import { pipe } from "../src/index";

describe("Operator", () => {
  // Test basic operator functionality
  test(
    "should locate elements in a running application",
    async () => {
      const appName = "Arc";

      // Attempt to locate elements with a generous timeout
      const elements = await pipe.operator
        .locator({
          app: appName,
          role: "AXWindow",
          useBackgroundApps: true,
          activateApp: true,
        })
        .all(10, 4);

      // We should at least find some UI elements
      expect(elements).toBeDefined();

      console.log("elements", elements);
    },
    { timeout: 100_000 }
  );
});
