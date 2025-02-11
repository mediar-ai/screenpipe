"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = HomePage;
const meeting_history_1 = require("@/components/meeting-history/meeting-history");
// Instead of redirecting, show meetings directly at root
function HomePage() {
    return <meeting_history_1.MeetingHistory />;
}
