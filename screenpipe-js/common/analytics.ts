import posthog from "posthog-js";

const POSTHOG_KEY = "phc_Bt8GoTBPgkCpDrbaIZzJIEYt0CrJjhBiuLaBck1clce";
const POSTHOG_HOST = "https://eu.i.posthog.com";

let initialized = false;

function initPosthog(userId?: string, email?: string) {
  if (!initialized) {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      distinct_id: userId,
      email: email,
    });
    posthog.identify(userId, { email: email });
    initialized = true;
  }
}

export async function captureEvent(
  name: string,
  properties?: Record<string, any>
): Promise<void> {
  initPosthog(properties?.distinct_id, properties?.email);
  const { distinct_id, ...restProperties } = properties || {};
  posthog.capture(name, restProperties);
}

export async function captureMainFeatureEvent(
  name: string,
  properties?: Record<string, any>
): Promise<void> {
  initPosthog(properties?.distinct_id, properties?.email);
  const { distinct_id, ...restProperties } = properties || {};
  posthog.capture(name, {
    feature: "main",
    ...restProperties,
  });
}
