use anyhow::Result;
use screenpipe_core::google::GoogleConfig;
use screenpipe_core::google_stream_text;

fn main() -> Result<()> {
    google_stream_text(GoogleConfig::default(), |text| {
        println!("{}", text);
        Ok(())
    })?;
    Ok(())
}
