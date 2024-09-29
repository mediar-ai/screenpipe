use candle::Device;

pub fn get_device() -> Device {
    Device::new_metal(0).unwrap_or(Device::new_cuda(0).unwrap_or(Device::Cpu))
}
