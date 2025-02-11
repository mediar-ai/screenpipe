"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusAlerts = StatusAlerts;
const lucide_react_1 = require("lucide-react");
const alert_1 = require("@/components/ui/alert");
function StatusAlerts({ serviceStatus, minimal = false }) {
    if (minimal) {
        return (<div className="fixed top-2 right-2 z-50">
        {serviceStatus === 'available' ? (<div className="w-2 h-2 rounded-full bg-green-500"/>) : (<div className="w-2 h-2 rounded-full bg-red-500"/>)}
      </div>);
    }
    if (serviceStatus === 'no_subscription') {
        return (<alert_1.Alert className="mb-4 border-red-500">
        <lucide_react_1.AlertTriangle className="h-4 w-4 text-red-500"/>
        <alert_1.AlertDescription className="text-red-500 font-medium">
          please subscribe to screenpipe cloud in settings.
        </alert_1.AlertDescription>
      </alert_1.Alert>);
    }
    if (serviceStatus === 'forbidden') {
        return (<alert_1.Alert className="mb-4 border-red-500">
        <lucide_react_1.AlertTriangle className="h-4 w-4 text-red-500"/>
        <alert_1.AlertDescription className="text-red-500 font-medium">
          real-time transcription is disabled. please enable it in screenpipe settings.
        </alert_1.AlertDescription>
      </alert_1.Alert>);
    }
    return null;
}
