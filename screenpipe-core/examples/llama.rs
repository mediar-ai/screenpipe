use anyhow::Result;

#[tokio::main]
#[cfg(feature = "llm")]
async fn main() -> Result<()> {
    use std::sync::Arc;

    use screenpipe_core::LLM;

    #[cfg(feature = "llm")]
    {
        let llm = Arc::new(LLM::new(screenpipe_core::ModelName::Llama)?);

        let llm_clone = llm.clone();
        let h1 = tokio::spawn(async move {
            llm_clone.chat(screenpipe_core::ChatRequest {
                messages: vec![screenpipe_core::ChatMessage {
                    role: "user".to_string(),
                    content: "What is the meaning of life?".to_string(),
                }],
                temperature: None,
                top_k: None,
                top_p: None,
                max_completion_tokens: Some(500),
                seed: None,
                stream: false,
            })
        });

        let h2 = tokio::spawn(async move {
            llm.chat(screenpipe_core::ChatRequest {
                messages: vec![screenpipe_core::ChatMessage {
                    role: "user".to_string(),
                    content: "My favorite theorem is".to_string(),
                }],
                temperature: None,
                top_k: None,
                top_p: None,
                max_completion_tokens: Some(500),
                seed: None,
                stream: false,
            })
        });

        let (res1, res2) = tokio::try_join!(h1, h2).unwrap();

        let res1 = res1?;
        let res2 = res2?;
        println!("{:?}", res1.choices[0].message.content);
        println!("{:?}", res2.choices[0].message.content);

        println!("{:?}", res1.usage.tps);
        println!("{:?}", res2.usage.tps);
    }
    Ok(())
}
