use screenpipe_server::chunking::text_chunking_simple;

#[test]
fn test_text_chunking_with_chinese_characters() {
    let chinese_text = "謝謝大家".repeat(100); // Repeat 100 times to ensure we exceed chunk size
    let result = text_chunking_simple(&chinese_text);

    assert!(
        result.is_ok(),
        "Function should not panic with Chinese characters"
    );

    let chunks = result.unwrap();
    assert!(!chunks.is_empty(), "Should produce at least one chunk");

    for chunk in chunks {
        assert!(!chunk.is_empty(), "Each chunk should contain text");
        assert!(
            chunk.chars().all(|c| c == '謝' || c == '大' || c == '家'),
            "Chunks should only contain expected characters"
        );
    }
}
