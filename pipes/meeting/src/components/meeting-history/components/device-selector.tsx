import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

interface DeviceSelectorProps {
  devices: Set<string>
  selectedDevices: Set<string>
  onDeviceToggle: (device: string) => void
}

export function DeviceSelector({ 
  devices, 
  selectedDevices, 
  onDeviceToggle 
}: DeviceSelectorProps) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">devices</h4>
      <div className="space-y-1">
        {Array.from(devices).map((device) => (
          <div key={device} className="flex items-center space-x-2">
            <Checkbox
              id={device}
              checked={selectedDevices.has(device)}
              onCheckedChange={() => onDeviceToggle(device)}
            />
            <Label htmlFor={device} className="text-sm">
              {device}
            </Label>
          </div>
        ))}
      </div>
    </div>
  )
}