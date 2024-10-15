use anyhow::Result;
use screenpipe_core::create_llama_engine;
use tracing::subscriber::set_global_default;
use tracing_subscriber::fmt::Subscriber;
#[tokio::main]
async fn main() -> Result<()> {
    // initialize logging
    let subscriber = Subscriber::builder()
        .with_env_filter("debug")
        .with_test_writer()
        .finish();
    set_global_default(subscriber).expect("Failed to set tracing subscriber");
    // create a new llama engine
    let mut llama =
        create_llama_engine("mradermacher/Llama-3.2-3B-Instruct-uncensored-GGUF", "Llama-3.2-3B-Instruct-uncensored.Q4_K_M.gguf").await?;

    // define a prompt
    let prompt = "Explain the concept of recursion in the universe:";

    // generate text
    let max_tokens = 100;
    let generated_text = llama.generate(prompt, max_tokens)?;

    // print the result
    println!("prompt: {}", prompt);
    println!("generated text: {}", generated_text);

    Ok(())
}
