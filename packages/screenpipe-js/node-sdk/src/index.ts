/**
 * @screenpipe/js — Node.js SDK for Screenpipe
 *
 * Re-exports the core ScreenpipeClient and all types.
 *
 *   import { ScreenpipeClient } from "@screenpipe/js";
 *   const client = new ScreenpipeClient();
 *   const health = await client.health();
 */

export { ScreenpipeClient } from "../../common/client";
export type { ScreenpipeClientConfig } from "../../common/client";
export * from "../../common/types";
