use anyhow::Result;

#[cfg(feature = "llm")]
fn main() -> Result<()> {
    #[cfg(feature = "llm")]
    {
        let mut llama = screenpipe_core::llama::Llama::new()?;
        llama.llama_stream_text(Some("What is the meaning of life?".to_string()), None)?;
        llama.llama_stream_text(Some("What is the meaning of life?".to_string()), None)?;
    }
    Ok(())
}
