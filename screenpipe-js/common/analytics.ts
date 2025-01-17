import posthog from "posthog-js";

const POSTHOG_KEY = "phc_Bt8GoTBPgkCpDrbaIZzJIEYt0CrJjhBiuLaBck1clce";
const POSTHOG_HOST = "https://eu.i.posthog.com";

let initialized = false;

function initPosthog() {
  if (!initialized) {
    posthog.init(POSTHOG_KEY, { api_host: POSTHOG_HOST });
    initialized = true;
  }
}

export async function identifyUser(
  userId: string,
  properties?: Record<string, any>
): Promise<void> {
  initPosthog();
  posthog.identify(userId, properties);
}

export async function captureEvent(
  name: string,
  properties?: Record<string, any>
): Promise<void> {
  initPosthog();
  posthog.capture(name, properties);
}

export async function captureMainFeatureEvent(
  name: string,
  properties?: Record<string, any>
): Promise<void> {
  initPosthog();
  posthog.capture(name, {
    feature: "main",
    ...properties,
  });
}
