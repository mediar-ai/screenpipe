// import { pipe, ContentItem } from "@screenpipe/js";
import { pipe, ContentItem } from "/Users/louisbeaumont/Documents/screen-pipe/screenpipe-js/main.ts";

async function monitorScreenAndNotify(): Promise<void> {
  console.log("starting screen monitor");

  pipe.scheduler
    .task("screenMonitor")
    .every("30 seconds")
    .do(async () => {
      try {
        console.log("checking for new screen content...");

        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

        console.log(
          `querying from ${fiveMinutesAgo.toISOString()} to ${now.toISOString()}`
        );

        const screenData = await pipe.queryScreenpipe({
          startTime: fiveMinutesAgo.toISOString(),
          endTime: now.toISOString(),
          limit: 10,
          contentType: "ocr",
        });

        console.log(`found ${screenData?.data.length || 0} items to analyze`);

        if (screenData && screenData.data.length > 0) {
          // Look for interesting keywords in the screen data
          const keywords = [
            "error",
            "warning",
            "failed",
            "completed",
            "success",
          ];

          for (const item of screenData.data) {
            if (item.type === "OCR") {
              const text = item.content.text.toLowerCase();

              for (const keyword of keywords) {
                if (text.includes(keyword)) {
                  console.log(`found keyword "${keyword}" in screen content`);
                  // Send notification with action
                  await pipe.inbox.send({
                    title: `detected "${keyword}"`,
                    body: `context: ${item.content.text.slice(0, 100)}...`,
                    actions: [
                      {
                        action: "view-details",
                        label: "view details",
                        callback: async () => {
                          console.log("full text:", item.content.text);
                          // You could open this in a viewer or send to inbox
                          await pipe.inbox.send({
                            title: `full context for "${keyword}"`,
                            body: item.content.text,
                          });
                        },
                      },
                    ],
                  });

                  break; // Skip other keywords for this item
                }
              }
            }
          }
        }
      } catch (error) {
        console.error("error monitoring screen:", error);
      }
    });

  pipe.scheduler.start();
}

// Start monitoring
monitorScreenAndNotify();

/*
Instructions:

1. Save this as pipe.ts in your screenpipe pipes directory

2. Run with:
   ```
   screenpipe pipe enable simple-notification
   screenpipe
   ```

For development, you can run:
```
# these are mandatory env variables
export SCREENPIPE_DIR="$HOME/.screenpipe"
export PIPE_ID="pipe-keyword-notification"
export PIPE_FILE="pipe.ts"
export PIPE_DIR="$SCREENPIPE_DIR/pipes/pipe-keyword-notification"

bun run examples/typescript/pipe-keyword-notification/pipe.ts
```

This pipe will:
- Monitor your screen every 30 seconds
- Look for keywords like "error", "warning", etc
- Send desktop notifications when found
- Allow you to click to see full context
*/
