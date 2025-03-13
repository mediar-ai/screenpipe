use tokio::runtime::Runtime;
use crate::icons::get_app_icon;

async fn setup_test_env() -> Result<()> {
    // Only initialize if not already set
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .try_init();
    Ok(())
}

#[tokio::test]
async fn test_icon_fetching() -> Result<()> {
    let app_name = "firefox";                       // a comman app name
    let result = get_app_icon(app_name, None).await;

}
