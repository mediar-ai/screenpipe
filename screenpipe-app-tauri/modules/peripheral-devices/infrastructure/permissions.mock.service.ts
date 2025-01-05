import { PermissionsService } from "../interfaces/permissions.service.interface";
import { AvailablePeripheralDevicesEnum } from "../types/available-devices";
import { OSPermissionsStatesPerDevice } from "../types/permission-state-per-device";

class MockPermissionsService implements PermissionsService {
    async requestPermission({ device }: {device: AvailablePeripheralDevicesEnum }): Promise<void> {
        window.alert('granting permission to access: ' + device)
        return  new Promise<void>((resolve) => {
            setTimeout(() => {
                resolve()
            }, 2000);
        })
    }
  
    async checkPermissions(): Promise<OSPermissionsStatesPerDevice> {
        return  new Promise<OSPermissionsStatesPerDevice>((resolve) => {
            setTimeout(() => {
                resolve({
                    'screenRecording': 'empty',
                    'microphone': 'empty',
                    'accessibility': 'empty'
                })
            }, 2000);
        })
    }
}

export default MockPermissionsService 