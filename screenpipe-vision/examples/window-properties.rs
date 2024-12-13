use anyhow::Result;
use tokio::time::{sleep, Duration};
use xcap::{Monitor, Window};

#[tokio::main]
async fn main() -> Result<()> {
    loop {
        println!("\n=== Windows State ===");

        match Window::all() {
            Ok(windows) => {
                for window in windows {
                    println!("Window: {}", window.title());
                    println!("  App: {}", window.app_name());
                    println!("  ID: {}", window.id());
                    println!("  Is Minimized: {}", window.is_minimized());
                    println!("  Is Visible: {}", window.is_maximized());
                    println!("  Title: {:?}", window.title());
                    println!("  Height: {:?}", window.height());
                    println!("  Width: {:?}", window.width());

                    println!("---");
                }
            }
            Err(e) => println!("failed to get windows: {:?}", e),
        }

        sleep(Duration::from_secs(1)).await;
    }
}
