"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PricingToggle = PricingToggle;
const label_1 = require("@/components/ui/label");
const switch_1 = require("@/components/ui/switch");
function PricingToggle({ isAnnual, onToggle }) {
    return (<div className="flex items-center gap-4  mb-4">
      <label_1.Label htmlFor="billing-toggle" className="text-sm">
        monthly
      </label_1.Label>
      <switch_1.Switch id="billing-toggle" checked={isAnnual} onCheckedChange={onToggle}/>
      <label_1.Label htmlFor="billing-toggle" className="text-sm">
        annual (save 17%)
      </label_1.Label>
    </div>);
}
