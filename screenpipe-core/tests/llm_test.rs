#[cfg(test)]
mod tests {
    use anyhow::Result;
    use candle::Device;
    use screenpipe_core::{generate_text_streaming, load_llama_model};
    #[test]
    #[ignore]
    fn test_generate_text_streaming() -> Result<()> {
        let device = Device::new_metal(0).unwrap_or(Device::new_cuda(0).unwrap_or(Device::Cpu));

        let (mut model, tokenizer) = load_llama_model(&device)?;

        let prompt = "Hello, world!";
        let max_tokens = 5;
        let temperature = 0.7;
        let top_p = 0.9;
        let seed = 42;
        let repeat_penalty = 1.;
        let repeat_last_n = 64;

        let mut generated_text = String::new();
        let callback = |text: String| {
            generated_text.push_str(&text);
            println!("{}", text);
            Ok(())
        };

        generate_text_streaming(
            &mut model,
            &tokenizer,
            prompt,
            max_tokens,
            temperature,
            repeat_penalty,
            repeat_last_n,
            seed,
            top_p,
            &device,
            callback,
        )?;

        assert!(!generated_text.is_empty());
        assert!(generated_text.len() > prompt.len());

        Ok(())
    }
}
