use crate::core::device::AudioDevice;

pub struct DeviceManager {
    devices: Vec<AudioDevice>,
}

impl DeviceManager {
    pub fn new() -> Self {
        DeviceManager {
            devices: Vec::new(),
        }
    }
}
