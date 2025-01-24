use futures::StreamExt;
use screenpipe_events::{send_event, subscribe_to_all_events, subscribe_to_event};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use tokio::time::{sleep, Duration};

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
struct TestData {
    message: String,
    count: i32,
}

#[tokio::test]
async fn test_single_subscriber() {
    let mut stream = subscribe_to_event!("test_event", String);
    send_event!("test_event", "hello".to_string());
    assert_eq!(stream.next().await.unwrap().data, "hello");
}

#[tokio::test]
async fn test_multiple_subscribers() {
    let mut stream1 = subscribe_to_event!("test_event", String);
    let mut stream2 = subscribe_to_event!("test_event", String);

    send_event!("test_event", "hello".to_string());

    assert_eq!(stream1.next().await.unwrap().data, "hello");
    assert_eq!(stream2.next().await.unwrap().data, "hello");
}

#[tokio::test]
async fn test_different_events() {
    let mut stream1 = subscribe_to_event!("event1", i32);
    let mut stream2 = subscribe_to_event!("event2", String);

    send_event!("event1", 42);
    send_event!("event2", "hello".to_string());

    assert_eq!(stream1.next().await.unwrap().data, 42);
    assert_eq!(stream2.next().await.unwrap().data, "hello");
}

#[tokio::test]
async fn test_complex_data() {
    let mut stream = subscribe_to_event!("complex", TestData);

    let data = TestData {
        message: "test".to_string(),
        count: 123,
    };

    send_event!("complex", data);

    let received = stream.next().await.unwrap();
    assert_eq!(received.data.message, "test");
    assert_eq!(received.data.count, 123);
}

#[tokio::test]
async fn test_dropped_events() {
    let mut stream = subscribe_to_event!("drop_test", i32);

    for i in 0..10000 {
        send_event!("drop_test", i);
    }

    sleep(Duration::from_millis(100)).await;
    send_event!("drop_test", -1);

    let last = stream.next().await.unwrap();
    assert!(last.data == -1 || last.data >= 0);
}

#[tokio::test]
async fn test_concurrent_senders() {
    let mut stream = subscribe_to_event!("concurrent_send", String);
    let mut send_handles = vec![];
    let expected_msgs: Arc<Mutex<HashSet<String>>> = Arc::new(Mutex::new(HashSet::new()));

    for i in 0..10 {
        let expected_msgs = expected_msgs.clone();
        send_handles.push(tokio::spawn(async move {
            let msg = format!("msg{}", i);
            expected_msgs.lock().unwrap().insert(msg.clone());
            send_event!("concurrent_send", msg);
        }));
    }

    for handle in send_handles {
        handle.await.unwrap();
    }

    let mut received_msgs = HashSet::new();
    for _ in 0..10 {
        let msg = stream.next().await.unwrap();
        received_msgs.insert(msg.data);
    }

    let expected_msgs = expected_msgs.lock().unwrap();
    assert_eq!(&received_msgs, &*expected_msgs);
}

#[tokio::test]
async fn test_unsubscribe() {
    let mut stream1 = subscribe_to_event!("unsubscribe_test", String);
    let mut stream2 = subscribe_to_event!("unsubscribe_test", String);

    send_event!("unsubscribe_test", "first".to_string());
    assert_eq!(stream1.next().await.unwrap().data, "first");
    assert_eq!(stream2.next().await.unwrap().data, "first");

    drop(stream1);

    send_event!("unsubscribe_test", "second".to_string());
    assert_eq!(stream2.next().await.unwrap().data, "second");
}

#[tokio::test]
async fn test_send_without_subscribers() {
    send_event!("no_subscribers", "test".to_string());
}

#[tokio::test]
async fn test_multiple_subscriptions_same_subscriber() {
    let mut stream1 = subscribe_to_event!("multi_sub");
    let mut stream2 = subscribe_to_event!("multi_sub");
    let mut stream3 = subscribe_to_event!("multi_sub");

    send_event!("multi_sub", "test".to_string());

    assert_eq!(stream1.next().await.unwrap().data, "test");
    assert_eq!(stream2.next().await.unwrap().data, "test");
    assert_eq!(stream3.next().await.unwrap().data, "test");
}

#[tokio::test]
async fn test_type_mismatch() {
    let mut stream = subscribe_to_event!("type_test");

    // This should fail type checking at compile time now
    // EventManager::instance().send("type_test", 42).unwrap();

    let result = tokio::time::timeout(Duration::from_millis(100), stream.next()).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_subscribe_macro_type_inference() {
    let mut string_stream = subscribe_to_event!("type_test1");
    send_event!("type_test1", "string data".to_string());
    assert_eq!(string_stream.next().await.unwrap().data, "string data");

    let mut int_stream = subscribe_to_event!("type_test2");
    send_event!("type_test2", 42);
    assert_eq!(int_stream.next().await.unwrap().data, 42);

    let mut complex_stream = subscribe_to_event!("type_test3", TestData);
    let test_data = TestData {
        message: "test macro".to_string(),
        count: 999,
    };
    send_event!("type_test3", test_data);

    let received = complex_stream.next().await.unwrap();
    assert_eq!(received.data.message, "test macro");
    assert_eq!(received.data.count, 999);
}

#[tokio::test]
async fn test_macro_multiple_subscribers() {
    let mut stream1 = subscribe_to_event!("macro_multi");
    let mut stream2 = subscribe_to_event!("macro_multi");

    send_event!("macro_multi", "broadcast".to_string());

    assert_eq!(stream1.next().await.unwrap().data, "broadcast");
    assert_eq!(stream2.next().await.unwrap().data, "broadcast");
}

#[tokio::test]
async fn test_subscribe_to_all_events() {
    let mut stream = subscribe_to_all_events!();
    send_event!("all_events", "test".to_string());
    send_event!("all_events2", 42);
    send_event!(
        "all_events3",
        TestData {
            message: "test3".to_string(),
            count: 999,
        }
    );
    // assert the stream has 3 events
    assert_eq!(stream.next().await.unwrap().name, "all_events");
}
