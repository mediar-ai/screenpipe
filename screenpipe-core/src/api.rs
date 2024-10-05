#[allow(clippy::module_inception)]
#[cfg(feature = "llm")]
mod api {
    #[derive(Deserialize, Serialize)]
    struct ChatMessage {
        role: String,
        content: String,
    }

    #[derive(Deserialize, Serialize)]
    struct ChatResponseChoice {
        index: i64,
        message: ChatMessage,
        logprobs: Option<serde_json::Value>,
        finish_reason: String,
    }

    #[derive(Deserialize, Serialize)]
    struct ChatResponseUsage {
        prompt_tokens: i64,
        completion_tokens: i64,
        total_tokens: i64,
        completion_tokens_details: serde_json::Value,
    }

    #[derive(Serialize, Deserialize)]
    struct ChatResponse {
        id: String,
        object: String,
        created: i64,
        model: String,
        system_fingerprint: String,
        choices: Vec<ChatResponseChoice>,
        usage: ChatResponseUsage,
    }

    #[derive(Deserialize)]
    struct ChatRequest {
        messages: Vec<ChatMessage>,
        #[serde(default)]
        stream: bool,
    }
    struct LLMManager {}
}

#[cfg(feature = "llm")]
pub use api::*;

// curl https://api.openai.com/v1/chat/completions \
//   -H "Content-Type: application/json" \
//   -H "Authorization: Bearer $OPENAI_API_KEY" \
//   -d '{
//     "model": "gpt-4o",
//     "messages": [
//       {
//         "role": "system",
//         "content": "You are a helpful assistant."
//       },
//       {
//         "role": "user",
//         "content": "Hello!"
//       }
//     ],
//     "stream": true
//   }'```
