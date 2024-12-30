[see reference](../../../../src-tauri/src/permissions.rs)

List of DTOs:

- AvailablePeripheralDevices: all devices used by screenpipe. Not part of rust, created as TS convenience to make typings more verbose.
- PermissionState: an enum with all possible permission states.  (OSPermissionStatus in permissions.rs)
- OSPermissionsStatesPerDevice: map Device->PermissionState. (OSPermissionsCheck in permissions.rs)