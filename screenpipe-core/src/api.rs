#[allow(clippy::module_inception)]
#[cfg(feature = "llm")]
mod api {
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
