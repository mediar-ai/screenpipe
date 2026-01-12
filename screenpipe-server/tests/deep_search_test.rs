use chrono::Utc;
use screenpipe_server::{DeepSearchQuery, DeepSearchResponse};

#[test]
fn test_deep_search_query_serialization() {
    let query = DeepSearchQuery {
        query: "What did I do?".to_string(),
        start_time: Some(Utc::now()),
        end_time: None,
        app_name: Some("Chrome".to_string()),
        window_name: None,
        limit: Some(10),
        offset: Some(0),
    };

    let serialized = serde_json::to_string(&query).unwrap();
    println!("Serialized query: {}", serialized);
    
    // Verify required fields
    assert!(serialized.contains("What did I do?"));
    assert!(serialized.contains("Chrome"));
}

#[test]
fn test_deep_search_response_construction() {
    let response = DeepSearchResponse {
        answer: "This is a synthesized answer.".to_string(),
        steps: vec![],
        sources: vec![],
    };

    let serialized = serde_json::to_string(&response).unwrap();
    assert!(serialized.contains("synthesized answer"));
}
