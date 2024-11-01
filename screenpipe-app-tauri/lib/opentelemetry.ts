import { Resource } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";

export function initOpenTelemetry(projectId: string, sessionId: string) {
  const isDebug = process.env.TAURI_ENV_DEBUG === "true";
  if (isDebug || window.origin.includes("localhost")) return;

  tracerProvider = new WebTracerProvider({
    resource: new Resource({
      "highlight.project_id": projectId,
      "highlight.session_id": sessionId,
      "service.name": "screenpipe-app-browser",
    }),
  });

  const exporter = new OTLPTraceExporter({
    url: "https://otel.highlight.io/v1/traces",
  });

  // create a custom span processor that only exports error spans
  const errorOnlySpanProcessor = new SimpleSpanProcessor({
    export: (span) => {
      const errorSpans = span.filter((s) => s.status.code === 2);
      if (errorSpans.length > 0) {
        // OpenTelemetry error status code
        exporter.export(errorSpans, () => {});
      }
    },
    forceFlush: () => Promise.resolve(),
    shutdown: () => Promise.resolve(),
  });

  tracerProvider.addSpanProcessor(errorOnlySpanProcessor as any);

  tracerProvider.register();

  // add global error handler
  window.addEventListener("error", (event) => {
    const tracer = tracerProvider!.getTracer("error-tracer");
    const span = tracer.startSpan("unhandled-error");
    span.setStatus({ code: 2 }); // set status to error
    span.recordException(event.error);
    span.end();
  });
}

let tracerProvider: WebTracerProvider | null = null;

export function getTracerProvider() {
  if (!tracerProvider) {
    tracerProvider = new WebTracerProvider();
  }
  return tracerProvider;
}

export function trackError(
  error: unknown,
  context: {
    operation: string;
    additionalAttributes?: Record<string, string>;
  }
) {
  const isDebug = process.env.TAURI_ENV_DEBUG === "true";
  if (isDebug || window.location.origin.includes("localhost")) return;

  const provider = getTracerProvider();
  const tracer = provider.getTracer("screenpipe-error-tracker");
  const span = tracer.startSpan(context.operation);

  span.setStatus({ code: 2 }); // OpenTelemetry error status code
  span.setAttribute("error.type", context.operation);
  span.setAttribute(
    "error.message",
    error instanceof Error ? error.message : String(error)
  );

  if (context.additionalAttributes) {
    Object.entries(context.additionalAttributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }

  span.end();
}
