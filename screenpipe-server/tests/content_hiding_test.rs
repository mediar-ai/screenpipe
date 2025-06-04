use screenpipe_server::{should_hide_content, create_censored_image};

#[tokio::test]
async fn test_should_hide_content_with_keywords() {
    // Test case-insensitive keyword matching
    let keywords = vec!["password".to_string(), "credit card".to_string()];
    
    assert!(should_hide_content("Enter your password here", &keywords));
    assert!(should_hide_content("PASSWORD is required", &keywords));
    assert!(should_hide_content("password123", &keywords));
    assert!(should_hide_content("Credit card number: 1234", &keywords));
    assert!(should_hide_content("CREDIT CARD details", &keywords));
    
    // Should not hide content without keywords
    assert!(!should_hide_content("This is normal content", &keywords));
    assert!(!should_hide_content("Regular text content", &keywords));
    assert!(!should_hide_content("", &keywords));
}

#[tokio::test]
async fn test_should_hide_content_empty_keywords() {
    let keywords: Vec<String> = vec![];
    
    // Should not hide anything when no keywords are specified
    assert!(!should_hide_content("Password field", &keywords));
    assert!(!should_hide_content("credit card info", &keywords));
    assert!(!should_hide_content("any content", &keywords));
}

#[tokio::test]
async fn test_should_hide_content_empty_keyword_in_list() {
    let keywords = vec!["".to_string(), "ssn".to_string()];
    
    // Should still work with valid keywords, ignoring empty ones
    assert!(should_hide_content("SSN: 123-45-6789", &keywords));
    assert!(!should_hide_content("Regular content", &keywords));
}

#[tokio::test]
async fn test_censored_image_creation() {
    
    let censored_image = create_censored_image();
    assert!(censored_image.is_some(), "Censored image should be created");
    
    let image_data = censored_image.unwrap();
    assert!(!image_data.is_empty(), "Censored image data should not be empty");
    
    // Check PNG header
    assert_eq!(&image_data[0..8], &[137, 80, 78, 71, 13, 10, 26, 10], "Should be valid PNG");
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    #[tokio::test]
    async fn test_get_frame_ocr_text_integration() {
        // This would be a more complete test with actual database setup
        // For now, just testing the logic
        let test_ocr_text = "Enter your password: mySecret123";
        let keywords = vec!["password".to_string()];
        
        let should_hide = should_hide_content(&test_ocr_text, &keywords);
        assert!(should_hide, "Password content should be hidden");
    }

    #[tokio::test]
    async fn test_frame_hiding_end_to_end() {
        // Create AppState with hide keywords
        let hide_keywords = vec!["api key".to_string(), "token".to_string()];
        let censored_image = create_censored_image();
        
        // Note: This is a simplified test - in practice you'd need full AppState setup
        // Testing the core logic that would be used in get_frame_data
        let ocr_text = "Your API key is: sk-abc123";
        let should_censor = should_hide_content(&ocr_text, &hide_keywords);
        
        assert!(should_censor, "Frame with API key content should be censored");
        assert!(censored_image.is_some(), "Censored image should be available");
    }
}

#[cfg(test)]
mod api_tests {
    use super::*;

    #[tokio::test]
    async fn test_frame_endpoint_returns_censored_headers() {
        // This would be a more complete integration test with a running server
        // For now, testing the logic components
        
        let keywords = vec!["private key".to_string()];
        let ocr_text = "Private key: -----BEGIN RSA PRIVATE KEY-----";
        
        assert!(should_hide_content(&ocr_text, &keywords));
        
        // In a real test, you'd verify:
        // - HTTP 200 status
        // - Content-Type: image/png
        // - X-Censored: true header
        // - Response body is the censored image
    }
}

#[cfg(test)]
mod search_tests {
    use super::*;

    #[tokio::test]
    async fn test_search_filters_hidden_content() {
        // Test that search results properly filter out or censor hidden content
        let keywords = vec!["social security".to_string(), "bank account".to_string()];
        
        // Simulate search results
        let test_results = vec![
            ("Normal content", false),
            ("Social Security Number: 123-45-6789", true),
            ("Another normal post", false),
            ("Bank account: 123456789", true),
            ("Regular content again", false),
        ];
        
        for (content, should_be_hidden) in test_results {
            let is_hidden = should_hide_content(content, &keywords);
            assert_eq!(is_hidden, should_be_hidden, 
                "Content '{}' hiding should be {}", content, should_be_hidden);
        }
    }
}

#[cfg(test)]
mod streaming_tests {
    use super::*;
    
    #[tokio::test]
    async fn test_streaming_frames_content_filtering() {
        // Test that streaming frames apply content filtering to OCR text
        let keywords = vec!["password".to_string(), "api key".to_string()];
        
        // Simulate OCR text that should be filtered
        let sensitive_texts = vec![
            "Enter password: secretPass123",
            "API key configuration: sk-abc123", 
            "Password field detected",
            "Your api key is xyz789"
        ];
        
        // Simulate normal OCR text that should not be filtered
        let normal_texts = vec![
            "Welcome to the application",
            "Click the submit button",
            "User interface element",
            "Normal screen content"
        ];
        
        // Verify sensitive content is detected for filtering
        for text in &sensitive_texts {
            assert!(should_hide_content(text, &keywords),
                "Sensitive text '{}' should be filtered in streaming frames", text);
        }
        
        // Verify normal content is not filtered
        for text in &normal_texts {
            assert!(!should_hide_content(text, &keywords),
                "Normal text '{}' should not be filtered in streaming frames", text);
        }
    }
}

#[cfg(test)]
mod performance_tests {
    use super::*;
    use std::time::Instant;

    #[tokio::test]
    async fn test_keyword_matching_performance() {
        let keywords = vec![
            "password".to_string(),
            "credit card".to_string(), 
            "ssn".to_string(),
            "api key".to_string(),
            "private key".to_string(),
        ];
        
        let test_text = "This is a long piece of text that might contain some password information but mostly normal text that should be processed quickly even with multiple keywords to check against";
        
        let start = Instant::now();
        for _ in 0..10000 {
            should_hide_content(test_text, &keywords);
        }
        let duration = start.elapsed();
        
        // Should be very fast - less than 100ms for 10k iterations
        assert!(duration.as_millis() < 100, 
            "Keyword matching too slow: {}ms for 10k iterations", duration.as_millis());
    }

    #[tokio::test]
    async fn test_censored_image_creation_performance() {
        let start = Instant::now();
        for _ in 0..100 {
            let _ = create_censored_image();
        }
        let duration = start.elapsed();
        
        // Image creation should be reasonable - less than 30 seconds for 100 creations
        // (The fallback is rarely used since we have the asset file)
        assert!(duration.as_millis() < 30000,
            "Censored image creation too slow: {}ms for 100 iterations", duration.as_millis());
    }
}