import { pipe } from "@screenpipe/js";
import * as fs from "fs/promises";

async function monitorVision() {
  console.log("starting vision monitor...");
  console.log("------------------------------");
  console.log("to view screenshots:");
  console.log(
    "1. paste this in a new terminal: 'open /Users/louisbeaumont/Documents/screenpipe/screenpipe-js/examples/vision-monitor/screenshots/viewer.html'"
  );
  console.log("2. watch live updates every 1s");
  console.log("------------------------------");

  // create screenshots directory
  await fs.mkdir("screenshots", { recursive: true });

  // create simple html viewer
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>screenpipe vision monitor</title>
        <style>
          body { 
            background: #000;
            color: #fff;
            font-family: monospace;
          }
          img {
            max-width: 90vw;
            margin: 20px auto;
            display: block;
            border: 1px solid #333;
          }
          .info {
            text-align: center;
            opacity: 0.7;
          }
        </style>
        <script>
          setInterval(() => {
            document.getElementById('latest').src = 'latest.png?' + Date.now();
          }, 1000);
        </script>
      </head>
      <body>
        <div class="info">screenpipe vision monitor</div>
        <img id="latest" src="latest.png" />
      </body>
    </html>
  `;
  await fs.writeFile("screenshots/viewer.html", htmlContent);

  for await (const event of pipe.streamVision(true)) {
    const { timestamp, window_name, image } = event.data;

    if (image) {
      const filename = `screenshots/${timestamp}-${window_name}.png`;
      // save to archive
      await fs.writeFile(filename, Buffer.from(image, "base64"));
      // update latest for viewer
      await fs.writeFile(
        "screenshots/latest.png",
        Buffer.from(image, "base64")
      );
      console.log(`saved screenshot: ${filename}`);
    }

    console.log(`window: ${window_name}`);
  }
}

monitorVision().catch(console.error);
