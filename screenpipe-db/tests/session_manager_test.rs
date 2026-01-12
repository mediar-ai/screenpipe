use chrono::{Duration, Utc};
use screenpipe_db::{DatabaseManager, SessionManager};
use std::sync::Arc;

async fn setup_test_db() -> Arc<DatabaseManager> {
    // connect to an in-memory db
    // we use sqlx::sqlite::SqlitePoolOptions
    let db = DatabaseManager::new("sqlite::memory:").await.unwrap();
    // run migrations
    sqlx::migrate!("./src/migrations")
        .run(&db.pool)
        .await
        .unwrap();
    Arc::new(db)
}

#[tokio::test]
async fn test_session_creation_and_update() {
    let db = setup_test_db().await;
    let sm = SessionManager::new(db.clone());

    let start_time = Utc::now();
    
    // 1. Create new session
    let session_id_1 = sm
        .handle_activity("App", "Window 1", start_time, true)
        .await
        .unwrap();

    // Verify it exists in DB
    let results = db.search_sessions(None, None, None, None).await.unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, session_id_1);
    assert_eq!(results[0].app_name, "App");
    assert_eq!(results[0].window_name, "Window 1");

    // 2. Update same session (within timeout)
    let next_time = start_time + Duration::seconds(10);
    let session_id_2 = sm
        .handle_activity("App", "Window 1", next_time, true)
        .await
        .unwrap();
    
    // Should be same ID
    assert_eq!(session_id_1, session_id_2);

    // Verify time update in DB
    let results = db.search_sessions(None, None, None, None).await.unwrap();
    assert_eq!(results[0].end_time.timestamp(), next_time.timestamp());
}

#[tokio::test]
async fn test_session_timeout() {
    let db = setup_test_db().await;
    let sm = SessionManager::new(db.clone());

    let start_time = Utc::now();
    
    // 1. Create first session
    let id1 = sm
        .handle_activity("App", "Window 1", start_time, true)
        .await
        .unwrap();

    // 2. Activity AFTER timeout (300s + 1s)
    let later_time = start_time + Duration::seconds(301);
    let id2 = sm
        .handle_activity("App", "Window 1", later_time, true)
        .await
        .unwrap();
    
    // Should be A NEW session ID
    assert_ne!(id1, id2);

    let results = db.search_sessions(None, None, None, None).await.unwrap();
    assert_eq!(results.len(), 2);
}

#[tokio::test]
async fn test_focused_session_tracking() {
    let db = setup_test_db().await;
    let sm = SessionManager::new(db.clone());

    let now = Utc::now();

    // Start App A (Focused)
    let id_a = sm.handle_activity("AppA", "WinA", now, true).await.unwrap();
    assert_eq!(sm.get_focused_session().await, Some(id_a));

    // Start App B (Background - Not Focused)
    let _id_b = sm.handle_activity("AppB", "WinB", now, false).await.unwrap();
    // Focus should still be A
    assert_eq!(sm.get_focused_session().await, Some(id_a));

    // Switch focus to App B
    let id_b_focused = sm.handle_activity("AppB", "WinB", now, true).await.unwrap();
    assert_eq!(sm.get_focused_session().await, Some(id_b_focused));
}
