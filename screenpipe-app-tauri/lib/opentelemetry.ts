import { Resource } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";

export function initOpenTelemetry(projectId: string, sessionId: string) {
  const provider = new WebTracerProvider({
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

  provider.addSpanProcessor(errorOnlySpanProcessor as any);

  provider.register();

  // add global error handler
  window.addEventListener("error", (event) => {
    const tracer = provider.getTracer("error-tracer");
    const span = tracer.startSpan("unhandled-error");
    span.setStatus({ code: 2 }); // set status to error
    span.recordException(event.error);
    span.end();
  });
}
