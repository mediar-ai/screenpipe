export interface AnalyticsClient {
  init: (key: string, config: any) => void;
  identify: (userId?: string, properties?: any) => void;
  capture: (name: string, properties?: any) => void;
}

let initialized = false;
let analyticsClient: AnalyticsClient | null = null;

const POSTHOG_KEY = "phc_Bt8GoTBPgkCpDrbaIZzJIEYt0CrJjhBiuLaBck1clce";
const POSTHOG_HOST = "https://eu.i.posthog.com";

export function setAnalyticsClient(client: AnalyticsClient) {
  analyticsClient = client;
}

function initAnalytics(userId?: string, email?: string) {
  if (!initialized && analyticsClient) {
    analyticsClient.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      distinct_id: userId,
      email: email,
    });
    analyticsClient.identify(userId, { email: email });
    initialized = true;
  }
}

export async function captureEvent(
  name: string,
  properties?: Record<string, any>
): Promise<void> {
  if (!analyticsClient) return;
  initAnalytics(properties?.distinct_id, properties?.email);
  const { distinct_id, ...restProperties } = properties || {};
  analyticsClient.capture(name, restProperties);
}

export async function captureMainFeatureEvent(
  name: string,
  properties?: Record<string, any>
): Promise<void> {
  if (!analyticsClient) return;
  initAnalytics(properties?.distinct_id, properties?.email);
  const { distinct_id, ...restProperties } = properties || {};
  analyticsClient.capture(name, {
    feature: "main",
    ...restProperties,
  });
}
