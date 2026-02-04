import { ScreenpipeClient } from "@screenpipe/js";

async function main() {
  const client = new ScreenpipeClient();

  // check health
  const health = await client.health();
  console.log("screenpipe status:", health.status);
  console.log("frame status:", health.frameStatus);
  console.log("audio status:", health.audioStatus);

  // list devices
  const monitors = await client.listMonitors();
  console.log("\nmonitors:", monitors);

  const audioDevices = await client.listAudioDevices();
  console.log("audio devices:", audioDevices);

  // search for recent input events
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const events = await client.uiEvents.search({
    startTime: fiveMinutesAgo,
    limit: 5,
  });
  console.log(`\nrecent input events: ${events.pagination.total} total`);
  for (const event of events.data) {
    console.log(`  [${event.eventType}] ${event.appName ?? "unknown"} - ${event.timestamp}`);
  }
}

main().catch(console.error);
