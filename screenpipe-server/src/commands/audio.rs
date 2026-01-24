use crate::cli::{AudioCommand, OutputFormat};
use screenpipe_audio::core::device::{default_input_device, default_output_device, list_audio_devices};
use serde_json::json;

pub async fn handle_audio_command(command: &AudioCommand) -> anyhow::Result<()> {
    match command {
        AudioCommand::List { output } => handle_list(output).await,
    }
}

async fn handle_list(output: &OutputFormat) -> anyhow::Result<()> {
    let default_input = default_input_device().unwrap();
    let default_output = default_output_device().await.unwrap();
    let devices = list_audio_devices().await?;

    match output {
        OutputFormat::Json => println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "data": devices.iter().map(|d| {
                    json!({
                        "name": d.to_string(),
                        "is_default": d.name == default_input.name || d.name == default_output.name
                    })
                }).collect::<Vec<_>>(),
                "success": true
            }))?
        ),
        OutputFormat::Text => {
            println!("available audio devices:");
            for device in devices.iter() {
                println!("  {}", device);
            }
            #[cfg(target_os = "macos")]
            println!("note: on macos, output devices are your displays");
        }
    }
    Ok(())
}
