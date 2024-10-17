use anyhow::{Result, Context};
use reqwest::Client;
use serde_json::{json, Value};
// use base64::{engine::general_purpose, Engine as _};
// use image::{DynamicImage, ImageFormat};
// use std::io::Cursor;

pub async fn call_ai(prompt: String, context: String, expect_json: bool) -> Result<String> {
    let client = Client::new();

    let messages = vec![
        json!({
            "role": "system",
            "content": context
        }),
        json!({
            "role": "user",
            "content": prompt
        })
    ];

    let mut body = json!({
        "model": "gpt-4o",
        "messages": messages,
        "temperature": 0.2,
        "stream": false
    });

    if expect_json {
        body["response_format"] = json!({"type": "json_object"});
    }

    let response: Value = client.post("https://ai-proxy.i-f9f.workers.dev/v1/chat/completions")
        .json(&body)
        .send()
        .await?
        .json()
        .await?;

    // Log the entire response for debugging
    // println!("raw api response: {}", serde_json::to_string_pretty(&response)?);

    if response.get("error").is_some() {
        // If there's an error, return it as a string
        let error_message = response["error"]["message"]
            .as_str()
            .unwrap_or("Unknown error")
            .to_string();
        return Err(anyhow::anyhow!(error_message));
    }

    let content = response["choices"]
        .get(0)
        .and_then(|choice| choice["message"]["content"].as_str())
        .context("failed to extract content from response")?
        .to_string();

    if expect_json {
        let json_value: Value = serde_json::from_str(&content)
            .context("response content is not valid JSON")?;
        
        if let Some(array) = json_value["response"].as_array() {
            // If "response" is an array, join its elements with newlines
            Ok(array.iter()
                .filter_map(|v| v.as_str())
                .collect::<Vec<_>>()
                .join("\n"))
        } else if let Some(response_str) = json_value["response"].as_str() {
            // If "response" is a string, return it directly
            Ok(response_str.to_string())
        } else {
            // If "response" is neither an array nor a string, return the whole JSON
            Ok(content)
        }
    } else {
        Ok(content)
    }
}

// Commented out unused enum and functions
// pub enum AIProvider {
//     OpenAI,
//     Claude,
// }

// pub async fn call_ai_with_screenshot(provider: AIProvider, prompt: String, expect_json: bool, screenshot: DynamicImage) -> Result<String> {
//     match provider {
//         AIProvider::OpenAI => call_openai_with_screenshot(prompt, expect_json, screenshot).await,
//         AIProvider::Claude => call_claude_with_screenshot(prompt, expect_json, screenshot).await,
//     }
// }

// pub async fn call_openai_with_screenshot(prompt: String, expect_json: bool, screenshot: DynamicImage) -> Result<String> {
//     dotenv().ok(); // Load .env file
//     let api_key = std::env::var("OPENAI_API_KEY").expect("OPENAI_API_KEY not set");
    
//     let client = Client::new();

//     // Convert image to base64
//     let mut image_buffer = Vec::new();
//     screenshot.write_to(&mut Cursor::new(&mut image_buffer), ImageFormat::Png)
//         .context("failed to write image to buffer")?;
//     let base64_image = general_purpose::STANDARD.encode(&image_buffer);

//     let messages = vec![
//         json!({
//             "role": "user",
//             "content": [
//                 {
//                     "type": "text",
//                     "text": prompt
//                 },
//                 {
//                     "type": "image_url",
//                     "image_url": {
//                         "url": format!("data:image/png;base64,{}", base64_image)
//                     }
//                 }
//             ]
//         })
//     ];

//     let mut body = json!({
//         "model": "gpt-4o",
//         "messages": messages,
//         "temperature": 0.2
//     });

//     if expect_json {
//         body["response_format"] = json!({"type": "json_object"});
//     }

//     let response: Value = client.post("https://api.openai.com/v1/chat/completions")
//         .header("Authorization", format!("Bearer {}", api_key))
//         .json(&body)
//         .send()
//         .await?
//         .json()
//         .await?;

//     // Log the entire response for debugging
//     // println!("raw api response: {}", serde_json::to_string_pretty(&response)?);

//     if response.get("error").is_some() {
//         let error_message = response["error"]["message"]
//             .as_str()
//             .unwrap_or("unknown error")
//             .to_string();
//         return Err(anyhow::anyhow!(error_message));
//     }

//     let choice = response["choices"]
//         .get(0)
//         .ok_or_else(|| anyhow::anyhow!("no choices in response"))?;

//     if let Some(refusal) = choice["message"]["refusal"].as_str() {
//         return Ok(refusal.to_string());
//     }

//     let content = choice["message"]["content"]
//         .as_str()
//         .context("failed to extract content from response")?
//         .to_string();

//     if expect_json {
//         serde_json::from_str::<Value>(&content)
//             .context("response content is not valid JSON")?;
//     }

//     Ok(content)
// }

// pub async fn call_claude_with_screenshot(prompt: String, expect_json: bool, screenshot: DynamicImage) -> Result<String> {
//     dotenv().ok(); // load .env file
//     let api_key = std::env::var("ANTHROPIC_API_KEY").context("ANTHROPIC_API_KEY not set")?;
    
//     let client = Client::new();

//     // Convert image to base64
//     let mut image_buffer = Vec::new();
//     screenshot.write_to(&mut Cursor::new(&mut image_buffer), ImageFormat::Png)
//         .context("failed to write image to buffer")?;
//     let base64_image = general_purpose::STANDARD.encode(&image_buffer);

//     let system_message = if expect_json {
//         "You must respond in valid JSON format. Always wrap your response in a JSON object with a 'response' key."
//     } else {
//         ""
//     };

//     let user_message = if expect_json {
//         format!("{}\nRemember to format your entire response as a JSON object with a 'response' key.", prompt)
//     } else {
//         prompt
//     };

//     let body = json!({
//         "model": "claude-3-5-sonnet-20240620",
//         "max_tokens": 1024,
//         "temperature": 0.2,
//         "system": system_message,
//         "messages": [
//             {
//                 "role": "user",
//                 "content": [
//                     {
//                         "type": "image",
//                         "source": {
//                             "type": "base64",
//                             "media_type": "image/png",
//                             "data": base64_image
//                         }
//                     },
//                     {
//                         "type": "text",
//                         "text": user_message
//                     }
//                 ]
//             }
//         ]
//     });

//     let response: Value = client.post("https://api.anthropic.com/v1/messages")
//         .header("x-api-key", &api_key)
//         .header("anthropic-version", "2023-06-01")
//         .header("content-type", "application/json")
//         .json(&body)
//         .send()
//         .await?
//         .json()
//         .await?;

//     // log the entire response for debugging
//     println!("raw api response: {}", serde_json::to_string_pretty(&response)?);

//     if response.get("error").is_some() {
//         let error_message = response["error"]["message"]
//             .as_str()
//             .unwrap_or("unknown error")
//             .to_string();
//         return Err(anyhow::anyhow!(error_message));
//     }

//     let content = response["content"]
//         .get(0)
//         .and_then(|content| content["text"].as_str())
//         .context("failed to extract content from response")?;

//     if expect_json {
//         // Validate that the content is valid JSON
//         serde_json::from_str::<Value>(content)
//             .context("response content is not valid JSON")?;
        
//         // Return the full JSON string
//         Ok(content.to_string())
//     } else {
//         Ok(content.to_string())
//     }
// }
