import { pipe } from "@screenpipe/js";

async function startScreenRecorder() {
  console.log("let's send events when our main feature is used ...");

  await pipe.captureEvent("less_useful_feature", {
    dog: "woof",
  });

  await pipe.captureMainFeatureEvent("very_useful_feature", {
    cat: "meow",
  });
}

startScreenRecorder().catch(console.error);
