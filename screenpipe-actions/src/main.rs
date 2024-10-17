use screenpipe_actions::run;
use tracing::Level;

fn main() -> anyhow::Result<()> {
    // try to enable tracing subscriber if not already running
    let subscriber = tracing_subscriber::fmt::Subscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber).unwrap();
    tokio::runtime::Runtime::new()?.block_on(run())
}
