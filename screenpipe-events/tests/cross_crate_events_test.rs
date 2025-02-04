use futures::StreamExt;
use screenpipe_events::{send_event, subscribe_to_event};
use serde::{Deserialize, Serialize};
use serial_test::serial;
// Simulate crate A's types and events
mod crate_a {
    use super::*;

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    pub struct UserEvent {
        pub username: String,
        pub action: String,
    }
}

// Simulate crate B's types and events
mod crate_b {
    use super::*;

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    pub struct ChatMessage {
        pub from: String,
        pub content: String,
    }
}

#[tokio::test]
#[serial]
async fn test_cross_crate_events() {
    // Subscribe to events from both crates
    let mut user_stream = subscribe_to_event::<crate_a::UserEvent>("user_joined");
    let mut chat_stream = subscribe_to_event::<crate_b::ChatMessage>("message_sent");

    // Send events from crate A
    let user_event = crate_a::UserEvent {
        username: "Alice".to_string(),
        action: "login".to_string(),
    };

    let _ = send_event("user_joined", user_event.clone());

    // Send events from crate B
    let chat_event = crate_b::ChatMessage {
        from: "Alice".to_string(),
        content: "Hello!".to_string(),
    };

    let _ = send_event("message_sent", chat_event.clone());

    // Verify events are received correctly
    assert_eq!(user_stream.next().await.unwrap().data, user_event);
    assert_eq!(chat_stream.next().await.unwrap().data, chat_event);
}

#[tokio::test]
#[serial]
async fn test_cross_crate_type_safety() {
    // Try to send wrong type to event (should not compile)
    // EventManager::instance().send("user_joined", "wrong type").unwrap();

    // Verify type safety across crate boundaries
    let mut user_stream = subscribe_to_event::<crate_a::UserEvent>("user_joined");
    let user_event = crate_a::UserEvent {
        username: "Bob".to_string(),
        action: "login".to_string(),
    };
    let _ = send_event("user_joined", user_event.clone());

    assert_eq!(user_stream.next().await.unwrap().data, user_event);
}

#[tokio::test]
#[serial]
async fn test_cross_crate_multiple_subscribers() {
    let mut stream1 = subscribe_to_event::<crate_a::UserEvent>("user_joined");
    let mut stream2 = subscribe_to_event::<crate_a::UserEvent>("user_joined");

    let event = crate_a::UserEvent {
        username: "Charlie".to_string(),
        action: "login".to_string(),
    };

    let _ = send_event("user_joined", event.clone());

    assert_eq!(stream1.next().await.unwrap().data, event);
    assert_eq!(stream2.next().await.unwrap().data, event);
}

#[tokio::test]
#[serial]
async fn test_multiple_event_types() {
    let mut user_joined = subscribe_to_event::<crate_a::UserEvent>("user_joined");
    let mut user_left = subscribe_to_event::<crate_a::UserEvent>("user_left");
    let mut message_sent = subscribe_to_event::<crate_b::ChatMessage>("message_sent");
    let mut message_edited = subscribe_to_event::<crate_b::ChatMessage>("message_edited");

    // Send multiple different events
    let join_event = crate_a::UserEvent {
        username: "Alice".to_string(),
        action: "login".to_string(),
    };
    let leave_event = crate_a::UserEvent {
        username: "Bob".to_string(),
        action: "logout".to_string(),
    };
    let msg_event = crate_b::ChatMessage {
        from: "Alice".to_string(),
        content: "Hello!".to_string(),
    };
    let edit_event = crate_b::ChatMessage {
        from: "Alice".to_string(),
        content: "Hello, world!".to_string(),
    };

    // Send all events
    let _ = send_event("user_joined", join_event.clone());
    let _ = send_event("user_left", leave_event.clone());
    let _ = send_event("message_sent", msg_event.clone());
    let _ = send_event("message_edited", edit_event.clone());

    // Verify all events are received in order
    assert_eq!(user_joined.next().await.unwrap().data, join_event);
    assert_eq!(user_left.next().await.unwrap().data, leave_event);
    assert_eq!(message_sent.next().await.unwrap().data, msg_event);
    assert_eq!(message_edited.next().await.unwrap().data, edit_event);
}

#[tokio::test]
#[serial]
async fn test_stream_drop_behavior() {
    // Create and immediately drop a stream
    {
        let _stream = subscribe_to_event::<crate_a::UserEvent>("user_joined");
    }

    // Send an event
    let event = crate_a::UserEvent {
        username: "Alice".to_string(),
        action: "login".to_string(),
    };

    // This should not panic even though the stream was dropped
    let _ = send_event("user_joined", event.clone());

    // Create a new stream and verify it receives new events
    let mut new_stream = subscribe_to_event::<crate_a::UserEvent>("user_joined");
    let _ = send_event("user_joined", event.clone());
    assert_eq!(new_stream.next().await.unwrap().data, event);
}

#[tokio::test]
#[serial]
async fn test_unregistered_event() {
    // Attempt to send an event that hasn't been registered
    let _ = send_event("nonexistent_event", "some data");
}
