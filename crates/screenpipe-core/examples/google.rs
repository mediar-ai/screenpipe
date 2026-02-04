use anyhow::Result;
#[cfg(feature = "llm")]
use screenpipe_core::google::GoogleConfig;
#[cfg(feature = "llm")]
use screenpipe_core::google_stream_text;

fn main() -> Result<()> {
    #[cfg(feature = "llm")]
    google_stream_text(GoogleConfig::default(), |text| {
        println!("{}", text);
        Ok(())
    })?;
    Ok(())
}
