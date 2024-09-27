use anyhow::Result;
use screenpipe_core::llama::LlamaInitConfig;
use screenpipe_core::llama_stream_text;

fn main() -> Result<()> {
    llama_stream_text(LlamaInitConfig::default(), |text| {
        println!("{}", text);
        Ok(())
    })?;
    Ok(())
}
