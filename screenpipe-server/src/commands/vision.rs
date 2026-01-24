use crate::cli::{OutputFormat, VisionCommand};
use screenpipe_vision::monitor::list_monitors;
use serde_json::json;

pub async fn handle_vision_command(command: &VisionCommand) -> anyhow::Result<()> {
    match command {
        VisionCommand::List { output } => handle_list(output).await,
    }
}

async fn handle_list(output: &OutputFormat) -> anyhow::Result<()> {
    let monitors = list_monitors().await;

    match output {
        OutputFormat::Json => println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "data": monitors.iter().map(|m| {
                    json!({
                        "id": m.id(),
                        "name": m.name(),
                        "width": m.width(),
                        "height": m.height(),
                        "is_default": m.is_primary(),
                    })
                }).collect::<Vec<_>>(),
                "success": true
            }))?
        ),
        OutputFormat::Text => {
            println!("available monitors:");
            for monitor in monitors.iter() {
                println!("  {}. {:?}", monitor.id(), monitor.name());
            }
        }
    }
    Ok(())
}
