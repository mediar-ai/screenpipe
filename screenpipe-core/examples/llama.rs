use anyhow::Result;
#[cfg(feature = "llm")]
use screenpipe_core::llama::LlamaInitConfig;
#[cfg(feature = "llm")]
use screenpipe_core::llama_stream_text;

fn main() -> Result<()> {
    #[cfg(feature = "llm")]
    llama_stream_text(LlamaInitConfig::default(), |text| {
        println!("{}", text);
        Ok(())
    })?;
    Ok(())
}
