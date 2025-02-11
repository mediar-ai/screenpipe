"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceSelector = DeviceSelector;
const checkbox_1 = require("@/components/ui/checkbox");
const label_1 = require("@/components/ui/label");
function DeviceSelector({ devices, selectedDevices, onDeviceToggle }) {
    return (<div className="space-y-2">
      <h4 className="text-sm font-medium">devices</h4>
      <div className="space-y-1">
        {Array.from(devices).map((device) => (<div key={device} className="flex items-center space-x-2">
            <checkbox_1.Checkbox id={device} checked={selectedDevices.has(device)} onCheckedChange={() => onDeviceToggle(device)}/>
            <label_1.Label htmlFor={device} className="text-sm">
              {device}
            </label_1.Label>
          </div>))}
      </div>
    </div>);
}
