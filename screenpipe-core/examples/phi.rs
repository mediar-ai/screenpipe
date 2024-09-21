use anyhow::Result;
use candle::Device;
use screenpipe_core::{generate_text_streaming, load_llama_model};
use std::io::BufRead;

fn main() -> Result<()> {
    let device = Device::new_metal(0).unwrap_or(Device::new_cuda(0).unwrap_or(Device::Cpu));

    let (mut model, tokenizer) = load_llama_model(&device)?;

    // use input from stdin if available
    let prompt = std::io::stdin().lock().lines().next().map_or(
        "explain quantum computing in simple terms:".to_string(),
        |line| line.unwrap().to_string(),
    );
    let max_tokens = 10;
    let temperature = 0.7;
    let top_p = 0.9;
    let seed = 42;
    let repeat_penalty = 1.;
    let repeat_last_n = 64;

    let callback = |text: String| {
        print!("{}", text);
        Ok(())
    };

    generate_text_streaming(
        &mut model,
        &tokenizer,
        &prompt,
        max_tokens,
        temperature,
        repeat_penalty,
        repeat_last_n,
        seed,
        top_p,
        &device,
        callback,
    )?;

    println!("\n");
    Ok(())
}
