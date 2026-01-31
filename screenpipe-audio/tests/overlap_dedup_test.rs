/// Overlap Deduplication Tests
///
/// Tests the overlap cleanup logic used to prevent duplicate transcriptions
/// from chunk boundaries and cross-device capture.
///
/// Run with: cargo test --package screenpipe-audio --test overlap_dedup_test -- --nocapture

#[cfg(test)]
mod tests {
    use screenpipe_audio::transcription::text_utils::longest_common_word_substring;

    // ============================================================================
    // LONGEST COMMON WORD SUBSTRING TESTS
    // ============================================================================

    #[test]
    fn test_lcws_partial_overlap_at_boundary() {
        // Simulates 2-second chunk overlap where speech continues across boundary
        let prev = "hello world this is a test";
        let curr = "this is a test of the system";

        let result = longest_common_word_substring(prev, curr);
        assert!(result.is_some());
        let (prev_idx, curr_idx, match_len) = result.unwrap();

        // "this is a test" should be found (4 words)
        // prev_idx should be 2 (index of "this" in prev)
        // curr_idx should be 0 (index of "this" in curr)
        assert_eq!(prev_idx, 2, "prev_idx should be 2");
        assert_eq!(curr_idx, 0, "curr_idx should be 0");
        assert_eq!(match_len, 4, "match_len should be 4 (this is a test)");
    }

    #[test]
    fn test_lcws_exact_duplicate() {
        // Cross-device capture: mic picks up exact same audio as speaker output
        let prev = "hello world this is a test";
        let curr = "hello world this is a test";

        let result = longest_common_word_substring(prev, curr);
        assert!(result.is_some());
        let (prev_idx, curr_idx, match_len) = result.unwrap();

        // Entire string is common, should start at 0 for both
        assert_eq!(prev_idx, 0, "prev_idx should be 0 for exact match");
        assert_eq!(curr_idx, 0, "curr_idx should be 0 for exact match");
        assert_eq!(match_len, 6, "match_len should be 6 (all words)");
    }

    #[test]
    fn test_lcws_no_overlap() {
        let prev = "the quick brown fox";
        let curr = "jumps over lazy dog";

        let result = longest_common_word_substring(prev, curr);
        // No common words, should return None
        // Based on the implementation, if no match found, returns None
        assert!(result.is_none(), "Should return None when no overlap");
    }

    #[test]
    fn test_lcws_single_word_overlap() {
        let prev = "hello world";
        let curr = "world peace";

        let result = longest_common_word_substring(prev, curr);
        assert!(result.is_some());
        let (prev_idx, curr_idx, match_len) = result.unwrap();

        assert_eq!(prev_idx, 1, "prev_idx should be 1 (world)");
        assert_eq!(curr_idx, 0, "curr_idx should be 0 (world)");
        assert_eq!(match_len, 1, "match_len should be 1 (world)");
    }

    #[test]
    fn test_lcws_with_punctuation() {
        // Punctuation should be ignored
        let prev = "hello, world! this is";
        let curr = "this is a test.";

        let result = longest_common_word_substring(prev, curr);
        assert!(result.is_some());
        let (prev_idx, curr_idx, match_len) = result.unwrap();

        // "this is" should match (2 words)
        assert_eq!(prev_idx, 2);
        assert_eq!(curr_idx, 0);
        assert_eq!(match_len, 2, "match_len should be 2 (this is)");
    }

    #[test]
    fn test_lcws_case_insensitive() {
        let prev = "Hello World This Is";
        let curr = "THIS IS a test";

        let result = longest_common_word_substring(prev, curr);
        assert!(result.is_some());
    }

    // ============================================================================
    // CLEANUP OVERLAP SIMULATION TESTS
    // ============================================================================

    /// Simulates the cleanup_overlap logic (FIXED version using match_len)
    fn simulate_cleanup_overlap(
        previous_transcript: &str,
        current_transcript: &str,
    ) -> Option<(String, String)> {
        if let Some((prev_idx, cur_idx, match_len)) =
            longest_common_word_substring(previous_transcript, current_transcript)
        {
            let prev_words: Vec<&str> = previous_transcript.split_whitespace().collect();
            let curr_words: Vec<&str> = current_transcript.split_whitespace().collect();

            // Keep words before the overlap in prev
            let new_prev = prev_words[..prev_idx].join(" ");

            // Skip past the overlap in curr (cur_idx + match_len)
            let skip_until = cur_idx + match_len;
            let new_cur = if skip_until < curr_words.len() {
                curr_words[skip_until..].join(" ")
            } else {
                String::new() // Entire current was overlap
            };

            return Some((new_prev, new_cur));
        }
        None
    }

    #[test]
    fn test_cleanup_partial_overlap() {
        let prev = "hello world this is a test";
        let curr = "this is a test of the system";

        let result = simulate_cleanup_overlap(prev, curr);
        assert!(result.is_some());
        let (new_prev, new_cur) = result.unwrap();

        // prev keeps words before overlap: "hello world"
        // curr skips past overlap ("this is a test"): "of the system"
        assert_eq!(new_prev, "hello world");
        assert_eq!(new_cur, "of the system");
    }

    #[test]
    fn test_cleanup_exact_duplicate_returns_empty() {
        // THIS IS THE BUG: exact duplicates should result in empty current
        let prev = "hello world this is a test";
        let curr = "hello world this is a test";

        let result = simulate_cleanup_overlap(prev, curr);
        assert!(result.is_some());
        let (new_prev, new_cur) = result.unwrap();

        // After cleanup, both should be empty because entire string overlaps
        assert_eq!(new_prev, "", "new_prev should be empty for exact duplicate");
        assert_eq!(new_cur, "", "new_cur should be empty for exact duplicate");
    }

    // ============================================================================
    // HANDLE_NEW_TRANSCRIPT SIMULATION TESTS
    // ============================================================================

    /// Simulates the OLD BUGGY cleanup logic (doesn't use match_len)
    fn simulate_buggy_cleanup_overlap(
        previous_transcript: &str,
        current_transcript: &str,
    ) -> Option<(String, String)> {
        if let Some((prev_idx, cur_idx, _match_len)) =
            longest_common_word_substring(previous_transcript, current_transcript)
        {
            let prev_words: Vec<&str> = previous_transcript.split_whitespace().collect();
            let curr_words: Vec<&str> = current_transcript.split_whitespace().collect();

            let new_prev = prev_words[..prev_idx].join(" ");
            // BUG: Uses cur_idx instead of cur_idx + match_len
            // This takes from the START of overlap, not AFTER it
            let new_cur = curr_words[cur_idx..].join(" ");

            return Some((new_prev, new_cur));
        }
        None
    }

    /// Simulates the handle_new_transcript logic to test deduplication behavior
    struct TranscriptHandler {
        previous_transcript: String,
        inserted_transcripts: Vec<String>,
        use_fixed_logic: bool,
    }

    impl TranscriptHandler {
        fn new_buggy() -> Self {
            Self {
                previous_transcript: String::new(),
                inserted_transcripts: Vec::new(),
                use_fixed_logic: false,
            }
        }

        fn new_fixed() -> Self {
            Self {
                previous_transcript: String::new(),
                inserted_transcripts: Vec::new(),
                use_fixed_logic: true,
            }
        }

        fn process(&mut self, new_transcript: &str) -> bool {
            let cleanup_result = if self.use_fixed_logic {
                simulate_cleanup_overlap(&self.previous_transcript, new_transcript)
            } else {
                simulate_buggy_cleanup_overlap(&self.previous_transcript, new_transcript)
            };

            if let Some((_, current)) = cleanup_result {
                // If current is empty after cleanup, skip insertion
                if current.is_empty() {
                    return false;
                }

                self.inserted_transcripts.push(current.clone());
                self.previous_transcript = new_transcript.to_string();
                return true;
            }

            // No overlap found, insert as-is
            if !new_transcript.is_empty() {
                self.inserted_transcripts.push(new_transcript.to_string());
                self.previous_transcript = new_transcript.to_string();
            }
            true
        }
    }

    #[test]
    fn test_buggy_logic_allows_exact_duplicates() {
        // This test demonstrates the BUG in the old logic
        let mut handler = TranscriptHandler::new_buggy();

        // Device A transcribes
        handler.process("hello world this is a test");
        assert_eq!(handler.inserted_transcripts.len(), 1);

        // Device B transcribes the SAME audio (cross-device capture)
        // With buggy logic: cur_idx=0, so curr_words[0..] = entire string (not empty!)
        handler.process("hello world this is a test");

        // BUG: Duplicate is inserted because current is NOT empty
        assert_eq!(
            handler.inserted_transcripts.len(),
            2,
            "Buggy logic allows duplicate insertion"
        );
    }

    #[test]
    fn test_fixed_logic_blocks_exact_duplicates() {
        let mut handler = TranscriptHandler::new_fixed();

        // Device A transcribes
        handler.process("hello world this is a test");
        assert_eq!(handler.inserted_transcripts.len(), 1);

        // Device B transcribes the SAME audio
        // With fixed logic: cur_idx=0, match_len=6, so skip_until=6 > len=6, returns empty
        let inserted = handler.process("hello world this is a test");

        // FIXED: Duplicate is blocked
        assert!(!inserted, "Fixed logic should block exact duplicate");
        assert_eq!(
            handler.inserted_transcripts.len(),
            1,
            "Fixed logic should not insert duplicate"
        );
    }

    // ============================================================================
    // REALISTIC SCENARIO TESTS
    // ============================================================================

    #[test]
    fn test_scenario_long_recording_with_chunk_overlap() {
        // Simulates 5 minutes of recording with 10-second chunks and 2-second overlap
        let mut handler = TranscriptHandler::new_fixed();

        // Chunk 1: 0-12s
        handler.process("the quick brown fox jumps over the lazy dog");

        // Chunk 2: 10-22s (overlaps with "the lazy dog")
        handler.process("the lazy dog sleeps in the sun");

        // Chunk 3: 20-32s (overlaps with "in the sun")
        handler.process("in the sun the cat watches quietly");

        // Should have 3 entries, with overlaps properly handled
        assert_eq!(handler.inserted_transcripts.len(), 3);

        // Check that we don't have duplicate phrases
        let combined = handler.inserted_transcripts.join(" ");
        let word_count = combined.split_whitespace().count();

        // Original words: 9 + 6 + 6 = 21, minus overlaps should be less
        println!("Combined: {}", combined);
        println!("Word count: {}", word_count);
    }

    #[test]
    fn test_scenario_cross_device_with_slight_timing_difference() {
        let mut handler = TranscriptHandler::new_fixed();

        // Speaker output captures first
        handler.process("welcome to the meeting everyone");

        // Mic captures slightly later with minor whisper variation
        // (punctuation/capitalization differences are normalized)
        handler.process("welcome to the meeting everyone");

        // Should only have 1 entry
        assert_eq!(
            handler.inserted_transcripts.len(),
            1,
            "Cross-device duplicate should be blocked"
        );
    }

    #[test]
    fn test_scenario_intermittent_speech_with_silence() {
        let mut handler = TranscriptHandler::new_fixed();

        // Speech burst 1
        handler.process("hello how are you");

        // Silence (no transcription)

        // Speech burst 2 - completely different
        handler.process("i am doing fine thanks");

        // Speech burst 3 - also different
        handler.process("lets discuss the project");

        // All 3 should be inserted (no overlap)
        assert_eq!(handler.inserted_transcripts.len(), 3);
    }

    #[test]
    fn test_scenario_rapid_device_interleaving() {
        let mut handler = TranscriptHandler::new_fixed();

        // Simulates rapid alternation between devices
        let transcripts = vec![
            ("speaker", "the weather is nice today"),
            ("mic", "the weather is nice today"), // duplicate
            ("speaker", "lets go for a walk"),
            ("mic", "lets go for a walk"), // duplicate
            ("speaker", "in the park"),
            ("mic", "in the park"), // duplicate
        ];

        for (_device, text) in transcripts {
            handler.process(text);
        }

        // Should only have 3 unique entries
        assert_eq!(
            handler.inserted_transcripts.len(),
            3,
            "Should have 3 unique transcripts, got: {:?}",
            handler.inserted_transcripts
        );
    }

    // ============================================================================
    // DEDUPLICATION ACCURACY BENCHMARK
    // ============================================================================

    #[test]
    fn benchmark_dedup_accuracy() {
        // Simulate a realistic 10-minute recording with:
        // - 2 devices (speaker + mic)
        // - 10-second chunks with 2-second overlap
        // - 50% of mic captures are duplicates of speaker
        // - Some chunks have intermittent silence

        let ground_truth_segments: Vec<&str> = vec![
            "welcome everyone to todays meeting",
            "we will discuss the quarterly results",
            "first lets look at the sales numbers",
            "sales increased by twenty percent",
            "this is great news for the team",
            "next we will discuss the roadmap",
            "the roadmap includes several features",
            "feature one is the new dashboard",
            "feature two is improved search",
            "any questions so far",
            "okay lets move to the next topic",
            "marketing has some updates",
            "the campaign was successful",
            "we reached our target audience",
            "thank you all for attending",
        ];

        // Simulate capture with duplicates and overlaps (using owned strings)
        let mut captured: Vec<(String, String)> = Vec::new();

        for (i, segment) in ground_truth_segments.iter().enumerate() {
            // Speaker always captures
            captured.push(("speaker".to_string(), segment.to_string()));

            // Mic captures 60% of the time (simulating echo/pickup)
            if i % 5 != 0 {
                captured.push(("mic".to_string(), segment.to_string()));
            }

            // Add some overlap simulation (partial phrases)
            if i > 0 && i < ground_truth_segments.len() - 1 {
                let overlap = format!(
                    "{} {}",
                    ground_truth_segments[i - 1]
                        .split_whitespace()
                        .last()
                        .unwrap_or(""),
                    segment.split_whitespace().next().unwrap_or("")
                );
                if overlap.split_whitespace().count() >= 2 {
                    captured.push(("overlap".to_string(), overlap));
                }
            }
        }

        // Process with fixed logic
        let mut handler = TranscriptHandler::new_fixed();
        let mut blocked = 0;
        let mut inserted = 0;

        for (_device, text) in &captured {
            if handler.process(text) {
                inserted += 1;
            } else {
                blocked += 1;
            }
        }

        let total = captured.len();
        let expected_unique = ground_truth_segments.len();
        let dedup_rate = blocked as f64 / total as f64 * 100.0;
        let accuracy = (inserted as f64 / expected_unique as f64).min(1.0) * 100.0;

        println!("\n=== DEDUPLICATION BENCHMARK ===");
        println!("Total captured: {}", total);
        println!("Inserted: {}", inserted);
        println!("Blocked (duplicates): {}", blocked);
        println!("Expected unique: {}", expected_unique);
        println!("Dedup rate: {:.1}%", dedup_rate);
        println!("Accuracy (inserted/expected): {:.1}%", accuracy);
        println!("================================\n");

        // We should block at least 30% as duplicates
        assert!(
            dedup_rate > 30.0,
            "Dedup rate should be > 30%, got {:.1}%",
            dedup_rate
        );

        // We should insert close to the expected unique count
        assert!(
            inserted <= expected_unique + 5,
            "Should not insert too many duplicates"
        );
    }

    #[test]
    fn benchmark_comparison_buggy_vs_fixed() {
        // Same test data for both
        let transcripts = vec![
            "welcome everyone to todays meeting",
            "we will discuss the quarterly results",
            "first lets look at the sales numbers",
            "sales increased by twenty percent",
            "this is great news for the team",
        ];

        // Buggy logic
        let mut buggy_handler = TranscriptHandler::new_buggy();
        for segment in &transcripts {
            buggy_handler.process(segment);
            buggy_handler.process(segment); // Duplicate
        }

        // Fixed logic
        let mut fixed_handler = TranscriptHandler::new_fixed();
        for segment in &transcripts {
            fixed_handler.process(segment);
            fixed_handler.process(segment); // Duplicate
        }

        let buggy_count = buggy_handler.inserted_transcripts.len();
        let fixed_count = fixed_handler.inserted_transcripts.len();
        let expected = transcripts.len();

        println!("\n=== BUGGY vs FIXED COMPARISON ===");
        println!("Input: {} unique transcripts, each sent twice", expected);
        println!(
            "Buggy logic inserted: {} (should be {})",
            buggy_count, expected
        );
        println!(
            "Fixed logic inserted: {} (should be {})",
            fixed_count, expected
        );
        println!(
            "Buggy duplicate rate: {:.1}%",
            (buggy_count as f64 / (expected * 2) as f64) * 100.0
        );
        println!(
            "Fixed duplicate rate: {:.1}%",
            (fixed_count as f64 / (expected * 2) as f64) * 100.0
        );
        println!("=================================\n");

        // Buggy logic inserts duplicates
        assert_eq!(
            buggy_count,
            expected * 2,
            "Buggy logic should insert duplicates"
        );

        // Fixed logic blocks duplicates
        assert_eq!(
            fixed_count, expected,
            "Fixed logic should only insert unique transcripts"
        );
    }
}
