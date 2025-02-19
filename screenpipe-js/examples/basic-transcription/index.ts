import { pipe } from "@screenpipe/browser";

async function monitorTranscriptions() {
  console.log("starting transcription monitor...");
  console.log(
    "please watch this video: https://youtu.be/UF8uR6Z6KLc?t=180"
  );

  for await (const chunk of pipe.streamTranscriptions()) {
    const text = chunk.choices[0].text;
    const isFinal = chunk.choices[0].finish_reason === "stop";
    const device = chunk.metadata?.device;

    console.log(`[${device}] ${isFinal ? "final:" : "partial:"} ${text}`);
  }
}

monitorTranscriptions().catch(console.error);
