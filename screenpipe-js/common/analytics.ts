export interface TrackEventOptions {
  name: EventName;
  properties?: AnalyticsProperties;
}

export const trackEvent = async (options: TrackEventOptions): Promise<void> => {
  try {
    const payload = {
      event: options.name,
      properties: {
        ...options.properties,
        timestamp: new Date().toISOString(),
      },
    };

    await fetch("https://eu.i.posthog.com/capture/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: "phc_Bt8GoTBPgkCpDrbaIZzJIEYt0CrJjhBiuLaBck1clce",
        event: options.name,
        properties: {
          ...options.properties,
          timestamp: new Date().toISOString(),
          distinct_id: "anonymous", // or get from settings if you want
        },
      }),
    });
  } catch (error) {
    console.error("failed to track event:", error);
  }
};
