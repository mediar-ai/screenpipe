use anyhow::Result;
#[cfg(feature = "llm")]
use screenpipe_core::mistral::MistralConfig;
#[cfg(feature = "llm")]
use screenpipe_core::stream_text;

fn main() -> Result<()> {
    #[cfg(feature = "llm")]
    stream_text(MistralConfig::default(), |text| {
        println!("{}", text);
        Ok(())
    })?;
    Ok(())
}
