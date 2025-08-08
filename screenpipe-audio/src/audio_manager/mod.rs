mod builder;
mod device_monitor;
mod manager;
mod macos_audio;

pub use builder::*;
pub use device_monitor::*;
pub use manager::*;
pub use macos_audio::*;

// Health status enum
pub enum DeviceHealthStatus {
    Healthy,
    Zombie,
    Disconnected,
}
