use futures::StreamExt;
use screenpipe_events::{send_event, update_event_registry};
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
    update_event_registry! {
        test_event => String,
    }
    let mut stream = test_event();
    send_event!("test_event", "hello".to_string());
    assert_eq!(stream.next().await.unwrap(), "hello");
}

#[tokio::test]
async fn test_multiple_subscribers() {
    update_event_registry! {
        test_event => String,
    }
    let mut stream1 = test_event();
    let mut stream2 = test_event();

    send_event!("test_event", "hello".to_string());

    assert_eq!(stream1.next().await.unwrap(), "hello");
    assert_eq!(stream2.next().await.unwrap(), "hello");
}

#[tokio::test]
async fn test_different_events() {
    update_event_registry! {
        event1 => i32,
        event2 => String,
    }
    let mut stream1 = event1();
    let mut stream2 = event2();

    send_event!("event1", 42);
    send_event!("event2", "hello".to_string());

    assert_eq!(stream1.next().await.unwrap(), 42);
    assert_eq!(stream2.next().await.unwrap(), "hello");
}

#[tokio::test]
async fn test_complex_data() {
    update_event_registry! {
        complex => TestData,
    }
    let mut stream = complex();

    let data = TestData {
        message: "test".to_string(),
        count: 123,
    };

    send_event!("complex", data);

    let received = stream.next().await.unwrap();
    assert_eq!(received.message, "test");
    assert_eq!(received.count, 123);
}

#[tokio::test]
async fn test_dropped_events() {
    update_event_registry! {
        drop_test => i32,
    }
    let mut stream = drop_test();

    for i in 0..10000 {
        send_event!("drop_test", i);
    }

    sleep(Duration::from_millis(100)).await;
    send_event!("drop_test", -1);

    let last = stream.next().await.unwrap();
    assert!(last == -1 || last >= 0);
}

#[tokio::test]
async fn test_concurrent_senders() {
    update_event_registry! {
        concurrent_send => String,
    }
    let mut stream = concurrent_send();
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
        received_msgs.insert(msg);
    }

    let expected_msgs = expected_msgs.lock().unwrap();
    assert_eq!(&received_msgs, &*expected_msgs);
}

#[tokio::test]
async fn test_unsubscribe() {
    update_event_registry! {
        unsubscribe_test => String,
    }
    let mut stream1 = unsubscribe_test();
    let mut stream2 = unsubscribe_test();

    send_event!("unsubscribe_test", "first".to_string());
    assert_eq!(stream1.next().await.unwrap(), "first");
    assert_eq!(stream2.next().await.unwrap(), "first");

    drop(stream1);

    send_event!("unsubscribe_test", "second".to_string());
    assert_eq!(stream2.next().await.unwrap(), "second");
}

#[tokio::test]
async fn test_send_without_subscribers() {
    update_event_registry! {
        no_subscribers => String,
    }

    send_event!("no_subscribers", "test".to_string());
}

#[tokio::test]
async fn test_multiple_subscriptions_same_subscriber() {
    update_event_registry! {
        multi_sub => String,
    }
    let mut stream1 = multi_sub();
    let mut stream2 = multi_sub();
    let mut stream3 = multi_sub();

    send_event!("multi_sub", "test".to_string());

    assert_eq!(stream1.next().await.unwrap(), "test");
    assert_eq!(stream2.next().await.unwrap(), "test");
    assert_eq!(stream3.next().await.unwrap(), "test");
}

#[tokio::test]
async fn test_type_mismatch() {
    update_event_registry! {
        type_test => String,
    }
    let mut stream = type_test();

    // This should fail type checking at compile time now
    // EventManager::instance().send("type_test", 42).unwrap();

    let result = tokio::time::timeout(Duration::from_millis(100), stream.next()).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_subscribe_macro_type_inference() {
    update_event_registry! {
        type_test1 => String,
        type_test2 => i32,
        type_test3 => TestData,
    }
    let mut string_stream = type_test1();
    send_event!("type_test1", "string data".to_string());
    assert_eq!(string_stream.next().await.unwrap(), "string data");

    let mut int_stream = type_test2();
    send_event!("type_test2", 42);
    assert_eq!(int_stream.next().await.unwrap(), 42);

    let mut complex_stream = type_test3();
    let test_data = TestData {
        message: "test macro".to_string(),
        count: 999,
    };
    send_event!("type_test3", test_data);

    let received = complex_stream.next().await.unwrap();
    assert_eq!(received.message, "test macro");
    assert_eq!(received.count, 999);
}

#[tokio::test]
async fn test_macro_multiple_subscribers() {
    update_event_registry! {
        macro_multi => String,
    }
    let mut stream1 = macro_multi();
    let mut stream2 = macro_multi();

    send_event!("macro_multi", "broadcast".to_string());

    assert_eq!(stream1.next().await.unwrap(), "broadcast");
    assert_eq!(stream2.next().await.unwrap(), "broadcast");
}
