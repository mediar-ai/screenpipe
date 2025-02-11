"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dynamic = void 0;
exports.GET = GET;
const server_1 = require("next/server");
exports.dynamic = "force-dynamic";
// A faulty API route to test Sentry's error monitoring
function GET() {
    throw new Error("Sentry Example API Route Error");
    return server_1.NextResponse.json({ data: "Testing Sentry Error..." });
}
