use screenpipe_actions::run;

fn main() -> anyhow::Result<()> {
    tokio::runtime::Runtime::new()?.block_on(run())
}