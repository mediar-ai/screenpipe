#[cfg(target_os = "macos")]
use anyhow::{Context, Result};
#[cfg(target_os = "macos")]
use core_foundation::base::TCFType;
#[cfg(target_os = "macos")]
use core_audio_sys::{
    kAudioDevicePropertyDeviceIsRunning,
    kAudioObjectPropertyElementMain,
    kAudioObjectPropertyScopeGlobal,
    AudioDeviceID,
    AudioObjectGetPropertyData,
    AudioObjectPropertyAddress,
    AudioUnitUninitialize,
    AudioComponentInstanceDispose,
    kAudioHardwarePropertyDevices
};
#[cfg(target_os = "macos")]
use std::{collections::HashMap, ptr::null};
#[cfg(target_os = "macos")]
use tokio::sync::Mutex;

#[cfg(target_os = "macos")]
lazy_static::lazy_static! {
    static ref ACTIVE_SESSIONS: Mutex<HashMap<String, AudioDeviceID>> = Mutex::new(HashMap::new());
}

#[cfg(target_os = "macos")]
pub async fn is_device_streaming(device_id: AudioDeviceID) -> bool {
    let mut is_running: u32 = 0;
    let mut size = std::mem::size_of_val(&is_running);
    let address = AudioObjectPropertyAddress {
        mSelector: kAudioDevicePropertyDeviceIsRunning,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    };
    
    let status = unsafe {
        AudioObjectGetPropertyData(
            device_id,
            &address,
            0,
            null(),
            &mut size,
            &mut is_running as *mut _ as *mut _
        )
    };
    
    status == 0 && is_running != 0
}

#[cfg(target_os = "macos")]
pub async fn release_device_resources(device_id: &str) -> anyhow::Result<()> {
    let mut sessions = ACTIVE_SESSIONS.lock().await;
    if let Some(&id) = sessions.get(device_id) {
        unsafe {
            AudioUnitUninitialize(id);
            AudioComponentInstanceDispose(id);
        }
        sessions.remove(device_id);
        info!("Released resources for {}", device_id);
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub async fn refresh_audio_session() -> anyhow::Result<()> {
    // Force CoreAudio to reload device list
    let address = AudioObjectPropertyAddress {
        mSelector: kAudioHardwarePropertyDevices,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    };
    
    unsafe {
        let status = AudioObjectGetPropertyData(
            0, // System object
            &address,
            0,
            null(),
            0,
            null(),
            null_mut()
        );
        
        if status != 0 {
            return Err(anyhow::anyhow!("CoreAudio refresh failed: {}", status));
        }
    }
    
    info!("Refreshed macOS audio session");
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub async fn is_device_streaming(_device_id: u32) -> bool { true }

#[cfg(not(target_os = "macos"))]
pub async fn release_device_resources(_device_id: &str) -> anyhow::Result<()> { Ok(()) }

#[cfg(not(target_os = "macos"))]
pub async fn refresh_audio_session() -> anyhow::Result<()> { Ok(()) }
