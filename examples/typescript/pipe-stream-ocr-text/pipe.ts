let INTERVAL = 10 * 1000; // 10 seconds in milliseconds

async function queryScreenpipe() {
  try {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - INTERVAL);

    const queryParams = `start_time=${oneMinuteAgo.toISOString()}&end_time=${now.toISOString()}&limit=50&content_type=ocr`;

    const result = await fetch(
      `http://localhost:3030/search?${queryParams}`
    ).then((r) => r.json());
    console.log("Retrieved", result.data.length, "items from screenpipe");
    return result.data;
  } catch (error) {
    console.error("Error querying screenpipe:", error);
    return [];
  }
}

async function writeToMarkdown(data: any) {
  console.log("Writing to markdown", JSON.stringify(data));
  const fileName = `screen-ocr-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.md`;
  const content = data
    .map(
      (item: any) =>
        `## ${item.content.timestamp}\n\n${item.content.text}\n\n---\n`
    )
    .join("\n");

  const dir = path.join(process.env.PIPE_DIR, fileName);
  console.log("Writing to", dir);
  await fs.writeFile(dir, content);
  console.log(`Written OCR data to ${fileName}`);
}

async function runOCRTracker() {
  console.log("Starting OCR Tracker");
  // wait 2 seocnds
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log(pipe);
  await pipe.loadConfig();
  INTERVAL = pipe.config.interval * 1000;
  console.log("INTERVAL", INTERVAL);

  while (true) {
    try {
      const screenData = await queryScreenpipe();
      await writeToMarkdown(screenData);
    } catch (error) {
      console.error("Error in OCR tracking:", error);
    } finally {
      await new Promise((resolve) => setTimeout(resolve, INTERVAL));
    }

    // const isEnabled = await pipe.isEnabled();
    // if (!isEnabled) {
    //   console.log("pipe is disabled");
    //   break;
    // }
  }
}

// Self-invoking async function to run the OCR tracker
(async () => {
  try {
    await runOCRTracker();
  } catch (error) {
    console.error("Fatal error in OCR Tracker:", error);
  }
})();
