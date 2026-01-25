use crate::cli::{AudioCommand, OutputFormat};
use screenpipe_audio::core::device::{default_input_device, default_output_device, list_audio_devices};
use serde_json::json;

pub async fn handle_audio_command(cmd: &AudioCommand) -> anyhow::Result<()> {
    match cmd {
        AudioCommand::List { output } => {
            let input = default_input_device()?;
            let out = default_output_device().await?;
            let devices = list_audio_devices().await?;

            match output {
                OutputFormat::Json => println!("{}", serde_json::to_string_pretty(&json!({
                    "data": devices.iter().map(|d| json!({
                        "name": d.to_string(),
                        "is_default": d.name == input.name || d.name == out.name
                    })).collect::<Vec<_>>(),
                    "success": true
                }))?),
                OutputFormat::Text => {
                    println!("available audio devices:");
                    for d in &devices { println!("  {}", d); }
                    #[cfg(target_os = "macos")]
                    println!("note: on macos, output devices are your displays");
                }
            }
        }
    }
    Ok(())
}
