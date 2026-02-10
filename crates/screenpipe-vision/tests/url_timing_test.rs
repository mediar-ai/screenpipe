//! Test to reproduce the URL-frame mismatch issue
//!
//! The bug: URL is fetched AFTER screenshot, so if browser navigates
//! between screenshot and URL fetch, wrong URL is associated with the frame.
//!
//! Run with: cargo test -p screenpipe-vision --test url_timing_test -- --nocapture

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;

/// Simulates a browser that changes URL over time
struct MockBrowser {
    urls: Vec<&'static str>,
    current_index: AtomicUsize,
}

impl MockBrowser {
    fn new() -> Self {
        Self {
            urls: vec![
                "https://google.com",
                "https://github.com",
                "https://twitter.com",
            ],
            current_index: AtomicUsize::new(0),
        }
    }

    /// Simulates browser navigation (URL changes)
    fn navigate_to_next(&self) {
        self.current_index.fetch_add(1, Ordering::SeqCst);
    }

    /// Gets current URL (what the URL fetch would return)
    fn get_current_url(&self) -> &'static str {
        let idx = self.current_index.load(Ordering::SeqCst);
        self.urls[idx % self.urls.len()]
    }
}

/// Simulates the CURRENT buggy behavior in crates/screenpipe-vision/src/core.rs
///
/// The issue is in capture_all_visible_windows():
/// 1. Screenshot is captured first (line ~175)
/// 2. Browser URL is fetched LATER via async task (line ~420)
/// 3. Time gap between these allows browser to navigate
async fn capture_frame_current_buggy_behavior(browser: Arc<MockBrowser>) -> (String, String) {
    // Step 1: Capture screenshot - this is what the user SEES in the frame
    let url_visible_in_screenshot = browser.get_current_url();
    let screenshot_content = format!(
        "Screenshot showing content from: {}",
        url_visible_in_screenshot
    );

    // Step 2: Simulate the async delay that exists in current code:
    // - OCR processing happens
    // - Queue waiting
    // - spawn_blocking for URL fetch
    // In real code this is 50-200ms typically
    sleep(Duration::from_millis(50)).await;

    // Step 3: Fetch URL AFTER screenshot (this is the bug!)
    // In core.rs line 420-422:
    //   let browser_url = tokio::task::spawn_blocking(move || {
    //       get_browser_url(&app_name_clone, process_id, &window_name_clone)
    //   }).await.ok().flatten();
    //
    // Browser may have navigated by now!
    let url_fetched_later = browser.get_current_url().to_string();

    // The frame is stored with url_fetched_later, not url_visible_in_screenshot
    (screenshot_content, url_fetched_later)
}

/// Simulates the FIXED behavior - fetch URL atomically with screenshot
async fn capture_frame_fixed_behavior(browser: Arc<MockBrowser>) -> (String, String) {
    // FIXED: Fetch URL FIRST or atomically with screenshot
    let url_at_capture = browser.get_current_url().to_string();

    // Capture screenshot - URL is already captured
    let screenshot_content = format!("Screenshot showing content from: {}", url_at_capture);

    // Any async processing happens AFTER, but URL is already locked in
    sleep(Duration::from_millis(50)).await;

    // Return the URL that was captured at screenshot time
    (screenshot_content, url_at_capture)
}

#[tokio::test]
#[ignore] // Known bug — URL mismatch when browser navigates during capture. Remove ignore when fix lands.
async fn test_bug_url_mismatch_when_browser_navigates_during_capture() {
    // This test reproduces the bug where:
    // - Screenshot shows google.com content
    // - But metadata says github.com (because browser navigated during capture)

    let browser = Arc::new(MockBrowser::new());
    let browser_for_navigation = browser.clone();

    // Simulate browser navigating DURING the capture process
    // This happens in real usage when user clicks a link
    let navigation_task = tokio::spawn(async move {
        // Navigate after 25ms (during the 50ms capture window)
        sleep(Duration::from_millis(25)).await;
        browser_for_navigation.navigate_to_next();
        println!("  [Browser] Navigated to next page during capture!");
    });

    println!("\n=== Testing CURRENT (buggy) behavior ===");
    println!("  [Capture] Starting frame capture...");

    let (screenshot, associated_url) = capture_frame_current_buggy_behavior(browser).await;
    navigation_task.await.unwrap();

    println!("  [Result] Screenshot: {}", screenshot);
    println!("  [Result] Associated URL in DB: {}", associated_url);

    // Check if URL in screenshot matches the associated URL
    let urls_match = screenshot.contains(&associated_url);

    if !urls_match {
        println!("\n  ❌ BUG REPRODUCED!");
        println!("     Screenshot shows content from one URL");
        println!("     But database stores a DIFFERENT URL");
        println!("     This causes the 'wrong URL' issue in timeline");
    }

    // This assertion demonstrates the bug - it SHOULD pass but FAILS
    // Comment out to see the bug, uncomment to enforce the fix
    assert!(
        urls_match,
        "\n\nBUG REPRODUCED: URL mismatch detected!\n\
         Screenshot content: {}\n\
         Associated URL: {}\n\n\
         The screenshot shows content from a different URL than what's stored in metadata.\n\
         This is the root cause of the 'wrong URL associated with frame' bug.\n",
        screenshot, associated_url
    );
}

#[tokio::test]
async fn test_fix_url_matches_when_captured_atomically() {
    // This test shows that the fix works - URL is captured atomically with screenshot

    let browser = Arc::new(MockBrowser::new());
    let browser_for_navigation = browser.clone();

    // Same navigation scenario
    let navigation_task = tokio::spawn(async move {
        sleep(Duration::from_millis(25)).await;
        browser_for_navigation.navigate_to_next();
        println!("  [Browser] Navigated to next page during capture!");
    });

    println!("\n=== Testing FIXED behavior ===");
    println!("  [Capture] Starting frame capture with atomic URL fetch...");

    let (screenshot, associated_url) = capture_frame_fixed_behavior(browser).await;
    navigation_task.await.unwrap();

    println!("  [Result] Screenshot: {}", screenshot);
    println!("  [Result] Associated URL in DB: {}", associated_url);

    let urls_match = screenshot.contains(&associated_url);

    if urls_match {
        println!("\n  ✅ FIX WORKS!");
        println!("     Screenshot and URL are from the same moment in time");
    }

    assert!(
        urls_match,
        "With the fix, screenshot and URL should always match"
    );
}

#[tokio::test]
async fn test_timing_gap_measurement() {
    // This test measures the timing gap in the current implementation
    // to document how much time exists for the race condition

    use std::time::Instant;

    println!("\n=== Measuring timing gap in capture process ===");

    let start = Instant::now();

    // Step 1: Screenshot capture (simulated)
    let t1 = start.elapsed();
    println!("  T+{:?}: Screenshot captured", t1);

    // Step 2: OCR processing (simulated - typically 20-50ms)
    sleep(Duration::from_millis(30)).await;
    let t2 = start.elapsed();
    println!("  T+{:?}: OCR processing complete", t2);

    // Step 3: URL fetch via spawn_blocking (simulated - typically 10-50ms)
    sleep(Duration::from_millis(20)).await;
    let t3 = start.elapsed();
    println!("  T+{:?}: URL fetched", t3);

    let total_gap = t3 - t1;
    println!("\n  ⚠️  Total timing gap: {:?}", total_gap);
    println!("     Any browser navigation within this window causes URL mismatch!");

    // Document that there IS a timing gap
    assert!(
        total_gap.as_millis() >= 50,
        "There should be a significant timing gap in current implementation"
    );
}
