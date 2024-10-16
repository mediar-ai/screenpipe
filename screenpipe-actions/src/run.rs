use crate::type_and_animate::{delete_characters, type_slowly, EnigoCommand};
use crate::{call_ai, run_keystroke_monitor, KeystrokeCommand};
use reqwest;
use tempfile::NamedTempFile;
use tokio::process::Command;
use tokio::sync::mpsc;
use tokio::task;
use tokio::time::Instant;
use tracing::{error, info};
use std::string::ToString;

pub async fn run() -> anyhow::Result<()> {
    info!("starting keystroke monitor. press '//' to print attributes for the current app and call openai.");
    let (tx, mut rx) = mpsc::channel(100);

    let (_enigo_tx, mut enigo_rx) = mpsc::channel(100);

    // Spawn the Enigo handler thread
    task::spawn_blocking(move || {
        use enigo::KeyboardControllable;
        let mut enigo = enigo::Enigo::new();
        while let Some(command) = enigo_rx.blocking_recv() {
            match command {
                EnigoCommand::TypeCharacter(c) => {
                    enigo.key_click(enigo::Key::Layout(c));
                }
                EnigoCommand::TypeString(s) => {
                    enigo.key_sequence(&s);
                }
                EnigoCommand::DeleteCharacter => {
                    enigo.key_click(enigo::Key::Backspace);
                }
                EnigoCommand::Shutdown => {
                    println!("Shutting down Enigo thread.");
                    break;
                }
            }
        }
    });

    // Spawn the keystroke monitor
    let tx_clone = tx.clone();
    task::spawn(async move {
        if let Err(e) = run_keystroke_monitor(tx_clone).await {
            eprintln!("Error in keystroke monitoring: {:?}", e);
        }
    });

    while let Some(command) = rx.recv().await {
        match command {
            KeystrokeCommand::DoubleSlash => {
                info!("double slash detected. calling ai...");

                type_slowly("thinking".to_string()).await?;
                let swift_output = run_swift_script().await?;

                // Use swift_output directly here
                // For example, pass it to the LLM or process it further

                info!("swift output: {}", swift_output);

                let prompt = format!(
                    r#"Based on the following Swift output,
                you need to continue where the "//" is. 
                Output your response in JSON format as follows:
                {{
                    "response": "Your response text here"
                }}
                The response should match the length, tone, and style of the message/prompt we are responding to.
                It should not look like it was written by AI.
                You are responding on behalf of the user, try to understand what is actually happening.
                We also provide you with detailed print out of the entire desktop content for your reference below:
                "{}"
                "#,
                    swift_output
                );

                let start = Instant::now();
                match call_ai(prompt, String::new(), true).await {
                    Ok(response) => {
                        let duration = start.elapsed();
                        info!("{:.1?} - first call_ai", duration);
                        delete_characters("thinking".len()).await?;
                        delete_characters(2).await?; // Delete the double slash
                        info!("ai response: {}", response);
                        type_slowly("[GENERIC_RESPONSE]".to_string()).await?;
                        type_slowly("\n".to_string()).await?;
                        type_slowly(response).await?;
                    }
                    Err(e) => {
                        let duration = start.elapsed();
                        error!("{:.1?} - failed first call_ai", duration);
                        delete_characters("thinking".len()).await?;
                        error!("failed to get response from ai: {}", e);
                        continue; // skip the rest of the loop iteration
                    }
                }
                type_slowly("\n".to_string()).await?;
                type_slowly("\n".to_string()).await?;
                type_slowly("[RESPONSE_WITH_CONTEXT]".to_string()).await?;

                let context = format!("Swift output: {}", swift_output);
                let prompt = r#"Based on the following Swift output, find double slash '//' to see where users curor is, 
                Now, provide 3 search queries to find relevant context in user files to continue the conversation. follow these guidelines:

                1. focus on specificity, avoid generic words
                2. use noun phrases, target key concepts
                3. employ technical terms when appropriate
                4. consider synonyms and related concepts
                5. utilize proper nouns (names, places, products)
                6. incorporate timeframes if relevant
                7. prioritize unusual or unique words
                8. consider file types if applicable

                return a json object with an array of 3 queries, each query should be one to three words max. format:
                {
                "response": [
                    "query1",
                    "query2",
                    "query3"
                ]
                }"#.to_string();

                let start = Instant::now();
                match call_ai(prompt, context, true).await {
                    Ok(response) => {
                        let duration = start.elapsed();
                        info!("{:.1?} - second call_ai", duration);
                        // println!("ai response: {}", response);

                        // Split the response by newlines to get individual queries
                        let queries: Vec<String> = response
                            .split('\n')
                            .map(|s| s.trim().to_string())
                            .filter(|s| !s.is_empty())
                            .collect();

                        let mut search_results = Vec::new();

                        for query in &queries {
                            match search_localhost(query).await {
                                // used to be &query
                                Ok(search_result) => {
                                    let truncated_result =
                                        search_result.chars().take(100).collect::<String>();
                                    let capitalized_query = query.to_uppercase();
                                    type_slowly(format!("[{}] ", capitalized_query)).await?;
                                    info!("search result for '{}': {}", query, truncated_result);
                                    search_results.push(search_result);
                                }
                                Err(e) => {
                                    error!("error searching localhost for '{}': {:?}", query, e)
                                }
                            }
                        }

                        type_slowly("\n".to_string()).await?;
                        type_slowly("analyzing".to_string()).await?;

                        // Final LLM call
                        let final_prompt = r#"Based on the desktop text and search results of my computer, draft a concise response.
                        Provide the most relevant message
                        Also provide who your message is addressed to ("TO_YOU" or "ON_YOUR_BEHALF")
                        You might be writing: a response, a follow-up, a suggestion, a clarification, or you might be puzzled
                        Output your response in JSON format as follows:
                        {
                            "response": "[ADDRESSED TO] Your response text here"
                        }
                        Ensure the response matches the length and tone of the message we are responding to.
                        Make the response concise and to the point.
                        The response should be casual, social media style.
                        It should not look like it was written by AI.
                        "#.to_string();
                        let final_context = format!(
                            "swift output: {}\nfirst llm response: {}\nsearch results: {}",
                            swift_output,
                            response,
                            search_results.join("\n")
                        );

                        let start = Instant::now();
                        match call_ai(final_prompt, final_context, true).await {
                            Ok(final_response) => {
                                let duration = start.elapsed();
                                info!("{:.1?} - final call_ai", duration);
                                delete_characters("analyzing".len()).await?;
                                info!("<<<llm final response>>>: {}", final_response);
                                type_slowly(final_response).await?;
                            }
                            Err(e) => {
                                error!("error in final openai call: {:?}", e);
                                continue;
                            }
                        }
                    }
                    Err(e) => {
                        error!("error in second openai call: {}", e);
                        continue;
                    }
                }
            }
        }
    }
    Ok(())
}

async fn run_swift_script() -> anyhow::Result<String> {
    let start = Instant::now();

    let script_content = include_str!("print_all_attributes.swift");
    let temp_file = NamedTempFile::new()?;
    tokio::fs::write(temp_file.path(), script_content).await?;

    info!("running swift script");
    let output = Command::new("swift").arg(temp_file.path()).output().await?;

    let duration = start.elapsed();
    info!("{:.1?} - run_swift_script", duration);

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    info!("debug: swift stdout length: {}", stdout.len());
    info!("debug: swift stderr length: {}", stderr.len());

    if !output.status.success() {
        info!(
            "debug: swift script failed with status: {:?}",
            output.status
        );
        anyhow::bail!("swift script failed: {}", stderr);
    }

    if stdout.is_empty() {
        info!("debug: swift stdout is empty, returning stderr");
        Ok(stderr.into_owned())
    } else {
        info!("debug: returning swift stdout");
        Ok(stdout.into_owned())
    }
}

async fn search_localhost(query: &str) -> anyhow::Result<String> {
    let start = Instant::now();
    let client = reqwest::Client::new();
    let url = format!(
        "http://localhost:3030/search?q={}&content_type=all&limit=5&offset=0",
        query
    );
    let response = client.get(&url).send().await?.text().await?;
    let duration = start.elapsed();
    info!("{:.1?} - search_localhost for '{}'", duration, query);
    Ok(response)
}
