// !!very experimental package!!
// This is a simple implementation of a main function that watches for changes in the database
// and performs actions based on specific triggers. The end goal is to create a system similar
// to Apple Shortcuts, where triggers and actions can be defined dynamically. In this version,
// we hardcode some trigger queries and actions for demonstration purposes.
//
// Triggers:
// - Specific SQL query hit like "dog appear 50 times within the past 2 days"
// - More advanced/complex triggers can be added later (e.g., "when I seem to watch TikTok videos about cats for 2 hours")
//
// Actions:
// - Make a request to an API
// - Function calling
// - Executing some code
//
// This is a basic version and can be iterated upon for more complex triggers and actions.
// This maintain a log of what you've been doing today

// make sure to run `ollama run phi3`

use reqwest::blocking::Client;
use rusqlite::Connection;
use std::fs;
use std::fs::File;
use std::thread;
use std::time::Duration;
use serde_json::json;
use std::io::Write;
use std::io::Read;
fn main() {
    let conn = Connection::open("../../screenpipe/data/db.sqlite").unwrap();
    let client = Client::new();
    // create file log with empty lines
    fs::write("log.md", "").unwrap();
    loop {
        let query = "
            SELECT COUNT(*), GROUP_CONCAT(at.text)
            FROM all_text at
            JOIN frames f ON at.frame_id = f.id
            WHERE f.timestamp <= datetime('now', '1 minutes')
            ORDER BY f.timestamp DESC
            LIMIT 100
        ";
        let count: i64 = conn.query_row(query, [], |row| row.get(0)).unwrap();
        let texts: Option<String> = conn.query_row(query, [], |row| row.get(1)).unwrap_or(None);


        println!("{}", count);
        if texts.is_some() {
            let texts = texts.unwrap();
            // println!("{}", texts);
            let response = client
                .post("http://localhost:11434/api/chat")
                .json(&json!({
                    "model": "phi3",
                    "stream": false,
                    "max_tokens": 4096,
                    "messages": [
                        { 
                            "role": "user", 
                            "content": format!(r#"you receive a markdown log of what the user has been doing today, 
                                that you maintain based on the text extracted from the user's screen. 
                                You can add new categories or update the existing ones. You can also add a new entry to the log. 
                                This is what has been shown on the user's screen over the past 5 minutes: {}
                                And this is the current log: {}

                                Rules:
                                - Keep the log small and concise, formatted as a bullet list
                                - Your responses are NOT in a code block e.g. no ```plaintext ```markdown etc.!

                                Now update the log based on the user's screen and respond with only the updated log. 
                                LOG OF THE USER'S DAY:
                                "#, 
                                texts,
                                fs::read_to_string("log.md").unwrap()
                            )
                        }
                    ]
                }))
                .send()
                .unwrap();
            let text: serde_json::Value = response.json().unwrap();
            // remove first " and last " from the response
            let llm_response = text["message"]["content"].to_string().trim_matches('"').to_string();

            println!("{}", llm_response);

            // replace all \n with \n\n
            let llm_response = llm_response.replace("\\n", "\n\n");

            // update to file
            fs::write("log.md", llm_response).unwrap();
        }

        // Sleep for a while before checking again
        thread::sleep(Duration::from_secs(5));
    }
}
