"use client";

import { trace, context } from "@opentelemetry/api";
import Error from "next/error";
import { useEffect } from "react";

export default function GlobalError({ error }) {
    useEffect(() => {
        const tracer = trace.getTracer("screenpipe-app");
        const span = tracer.startSpan("global-error");
        context.with(trace.setSpan(context.active(), span), () => {
            span.recordException(error);
            span.end();
        });
    }, [error]);

    return (
        <html>
            <body>
                <Error />
            </body>
        </html>
    );
}