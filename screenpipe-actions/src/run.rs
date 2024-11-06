use crate::type_and_animate::{delete_characters, type_slowly, EnigoCommand};
use crate::{call_ai, run_keystroke_monitor, KeystrokeCommand};
use reqwest;
use std::path::Path;
use std::string::ToString;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::sync::mpsc;
use tokio::task;
use tokio::time::Instant;
use tracing::{error, info};

// TODO: make this function not prevent ctrl+c in the future
pub async fn run() -> anyhow::Result<()> {
    info!("starting keystroke monitor. press '//' to print attributes for the current app and call openai. press 'ctrl+q' to stop.");
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
                    info!("Shutting down Enigo thread.");
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

    let stop_signal = Arc::new(AtomicBool::new(false));

    loop {
        tokio::select! {
            Some(command) = rx.recv() => {
                match command {
                    KeystrokeCommand::DoubleSlash => {
                        // Reset the stop signal at the start of a new action
                        stop_signal.store(false, Ordering::SeqCst);

                        info!("double slash detected. calling ai...");

                        type_slowly("thinking".to_string(), stop_signal.clone()).await?;
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
                        let stop_signal_clone = stop_signal.clone();
                        match call_ai(prompt, String::new(), true).await {
                            Ok(response) => {
                                let duration = start.elapsed();
                                info!("{:.1?} - first call_ai", duration);
                                delete_characters("thinking".len()).await?;
                                delete_characters(2).await?; // Delete the double slash
                                info!("ai response: {}", response);

                                // Spawn a new task for typing
                                let typing_task = task::spawn(async move {
                                    let _ = type_slowly("[GENERIC_RESPONSE]".to_string(), stop_signal_clone.clone()).await;
                                    let _ = type_slowly("\n".to_string(), stop_signal_clone.clone()).await;
                                    let _ = type_slowly(response, stop_signal_clone).await;
                                });

                                // Wait for the typing task to complete or be interrupted
                                tokio::select! {
                                    _ = typing_task => {},
                                    _ = rx.recv() => {
                                        // If we receive any command while typing, stop the typing
                                        stop_signal.store(true, Ordering::SeqCst);
                                    }
                                }
                            }
                            Err(e) => {
                                let duration = start.elapsed();
                                error!("{:.1?} - failed first call_ai", duration);
                                delete_characters("thinking".len()).await?;
                                error!("failed to get response from ai: {}", e);
                                continue; // skip the rest of the loop iteration
                            }
                        }
                        type_slowly("\n".to_string(), stop_signal.clone()).await?;
                        type_slowly("\n".to_string(), stop_signal.clone()).await?;
                        type_slowly("[RESPONSE_WITH_CONTEXT]".to_string(), stop_signal.clone()).await?;

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
                                            type_slowly(format!("[{}] ", capitalized_query), stop_signal.clone()).await?;
                                            info!("search result for '{}': {}", query, truncated_result);
                                            search_results.push(search_result);
                                        }
                                        Err(e) => {
                                            error!("error searching localhost for '{}': {:?}", query, e)
                                        }
                                    }
                                }

                                type_slowly("\n".to_string(), stop_signal.clone()).await?;
                                type_slowly("analyzing".to_string(), stop_signal.clone()).await?;

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
                                        type_slowly(final_response, stop_signal.clone()).await?;
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
                    },
                    KeystrokeCommand::Stop => {
                        info!("stop command received. stopping current action...");
                        stop_signal.store(true, Ordering::SeqCst);
                    }
                }
            },
            else => break,
        }
    }

    // Cleanup code
    info!("shutting down enigo thread...");
    if let Err(e) = _enigo_tx.send(EnigoCommand::Shutdown).await {
        error!("failed to send shutdown command to enigo thread: {:?}", e);
    }

    Ok(())
}

async fn run_swift_script() -> anyhow::Result<String> {
    let start = Instant::now();

    let script_content = r#"
import Cocoa
import ApplicationServices
import Foundation

class QueueElement {
    let element: AXUIElement
    let depth: Int
    
    init(_ element: AXUIElement, depth: Int) {
        self.element = element
        self.depth = depth
    }
}

func printAllAttributeValues(_ startElement: AXUIElement) {
    var elements: [(CGPoint, CGSize, String)] = []
    var visitedElements = Set<AXUIElement>()
    let unwantedValues = ["0", "", "", "3", ""]
    let unwantedLabels = [
        "window", "application", "group", "button", "image", "text",
        "pop up button", "region", "notifications", "table", "column",
        "html content"
    ]
    
    func traverseHierarchy(_ element: AXUIElement, depth: Int) {
        guard !visitedElements.contains(element) else { return }
        visitedElements.insert(element)
        
        var attributeNames: CFArray?
        let result = AXUIElementCopyAttributeNames(element, &attributeNames)
        
        guard result == .success, let attributes = attributeNames as? [String] else { return }
        
        var position: CGPoint = .zero
        var size: CGSize = .zero
        
        // Get position
        if let positionValue = getAttributeValue(element, forAttribute: kAXPositionAttribute) as! AXValue?,
           AXValueGetType(positionValue) == .cgPoint {
            AXValueGetValue(positionValue, .cgPoint, &position)
        }
        
        // Get size
        if let sizeValue = getAttributeValue(element, forAttribute: kAXSizeAttribute) as! AXValue?,
           AXValueGetType(sizeValue) == .cgSize {
            AXValueGetValue(sizeValue, .cgSize, &size)
        }
        
        for attr in attributes {
            if ["AXDescription", "AXValue", "AXLabel", "AXRoleDescription", "AXHelp"].contains(attr) {
                if let value = getAttributeValue(element, forAttribute: attr) {
                    let valueStr = describeValue(value)
                    if !valueStr.isEmpty && !unwantedValues.contains(valueStr) && valueStr.count > 1 &&
                       !unwantedLabels.contains(valueStr.lowercased()) {
                        elements.append((position, size, valueStr))
                    }
                }
            }
            
            // Traverse child elements
            if let childrenValue = getAttributeValue(element, forAttribute: attr) {
                if let elementArray = childrenValue as? [AXUIElement] {
                    for childElement in elementArray {
                        traverseHierarchy(childElement, depth: depth + 1)
                    }
                } else if let childElement = childrenValue as! AXUIElement? {
                    traverseHierarchy(childElement, depth: depth + 1)
                }
            }
        }
    }
    
    traverseHierarchy(startElement, depth: 0)
    
    // Sort elements from top to bottom, then left to right
    elements.sort { (a, b) in
        if a.0.y != b.0.y {
            return a.0.y < b.0.y
        } else {
            return a.0.x < b.0.x
        }
    }
    
    // Deduplicate and print sorted elements to stdout, excluding coordinates
    var uniqueValues = Set<String>()
    for (_, _, valueStr) in elements {
        if uniqueValues.insert(valueStr).inserted {
            print(valueStr)
        }
    }
}

func formatCoordinates(_ position: CGPoint, _ size: CGSize) -> String {
    return String(format: "(x:%.0f,y:%.0f,w:%.0f,h:%.0f)", position.x, position.y, size.width, size.height)
}

func describeValue(_ value: AnyObject?) -> String {
    switch value {
    case let string as String:
        return string
    case let number as NSNumber:
        return number.stringValue
    case let point as NSPoint:
        return "(\(point.x), \(point.y))"
    case let size as NSSize:
        return "w=\(size.width) h=\(size.height)"
    case let rect as NSRect:
        return "x=\(rect.origin.x) y=\(rect.origin.y) w=\(rect.size.width) h=\(rect.size.height)"
    case let range as NSRange:
        return "loc=\(range.location) len=\(range.length)"
    case let url as URL:
        return url.absoluteString
    case let array as [AnyObject]:
        return array.isEmpty ? "Empty array" : "Array with \(array.count) elements"
    case let axValue as AXValue:
        return describeAXValue(axValue)
    case is AXUIElement:
        return "AXUIElement"
    case .none:
        return "None"
    default:
        return String(describing: value)
    }
}

func describeAXValue(_ axValue: AXValue) -> String {
    let type = AXValueGetType(axValue)
    switch type {
    case .cgPoint:
        var point = CGPoint.zero
        AXValueGetValue(axValue, .cgPoint, &point)
        return "(\(point.x), \(point.y))"
    case .cgSize:
        var size = CGSize.zero
        AXValueGetValue(axValue, .cgSize, &size)
        return "w=\(size.width) h=\(size.height)"
    case .cgRect:
        var rect = CGRect.zero
        AXValueGetValue(axValue, .cgRect, &rect)
        return "x=\(rect.origin.x) y=\(rect.origin.y) w=\(rect.size.width) h=\(rect.size.height)"
    case .cfRange:
        var range = CFRange(location: 0, length: 0)
        AXValueGetValue(axValue, .cfRange, &range)
        return "loc=\(range.location) len=\(range.length)"
    default:
        return "Unknown AXValue type"
    }
}

func getAttributeValue(_ element: AXUIElement, forAttribute attr: String) -> AnyObject? {
    var value: AnyObject?
    let result = AXUIElementCopyAttributeValue(element, attr as CFString, &value)
    return result == .success ? value : nil
}

func printAllAttributeValuesForCurrentApp() {
    guard let app = NSWorkspace.shared.frontmostApplication else {
        return
    }
    
    let pid = app.processIdentifier
    let axApp = AXUIElementCreateApplication(pid)
    
    print("attribute values for \(app.localizedName ?? "unknown app"):")
    printAllAttributeValues(axApp)
}

// usage
printAllAttributeValuesForCurrentApp()
"#;

    info!("running swift script");

    // Check multiple possible Swift paths
    let swift_paths = [
        "/usr/bin/swift",          // Common path for both Intel and Apple Silicon
        "/usr/local/bin/swift",    // Possible alternative location
        "/opt/homebrew/bin/swift", // Homebrew path on Apple Silicon
    ];

    let swift_path = swift_paths
        .iter()
        .find(|&path| Path::new(path).exists())
        .ok_or_else(|| {
            anyhow::anyhow!("Swift executable not found in any of the expected locations")
        })?;

    info!("using swift at: {}", swift_path);

    let mut child = Command::new(swift_path)
        .arg("-") // Read from stdin
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;

    // Write to stdin
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(script_content.as_bytes()).await?;
        stdin.flush().await?;
    }

    // Wait for the command to complete and get the output
    let output = child.wait_with_output().await?;

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
