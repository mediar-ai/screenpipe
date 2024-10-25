use anyhow::Result;
use screenpipe_audio::{audio_processing::AudioInput, stt::TranscriptionResult};
use std::time::Instant;
use strsim::normalized_levenshtein;

// Helper function to assert similarity with detailed output
fn assert_similar(actual: &str, expected: &str, context: &str, threshold: f64) {
    let similarity = normalized_levenshtein(
        &actual.to_lowercase().trim(),
        &expected.to_lowercase().trim(),
    );
    assert!(
        similarity >= threshold,
        "\nSimilarity {:.2} below threshold {:.2} for {}:\nActual: '{}'\nExpected: '{}'\n",
        similarity,
        threshold,
        context,
        actual,
        expected
    );
}

#[tokio::test]
async fn test_cleanup_overlap_llm() -> Result<()> {
    const SIMILARITY_THRESHOLD: f64 = 0.7; // Adjust this threshold as needed

    let test_cases = vec![
        // Common case: Speaker finishing a sentence
        (
            "so what I'm trying to explain is that the neural network",
            "neural network architecture consists of multiple layers",
            ("so what I'm trying to explain is that the", "neural network architecture consists of multiple layers"),
        ),
        // Interruption mid-sentence
        (
            "let me show you how to implement this feature in the code base",
            "in the code base we need to first initialize the configuration",
            ("let me show you how to implement this feature", "in the code base we need to first initialize the configuration"),
        ),
        // Technical discussion with specific terms
        (
            "when you're using async await in rust you need to understand the tokio runtime",
            "the tokio runtime handles all the asynchronous tasks efficiently",
            ("when you're using async await in rust you need to understand", "the tokio runtime handles all the asynchronous tasks efficiently"),
        ),
        // Meeting context with multiple speakers
        (
            "and then John mentioned that we should refactor the database schema",
            "the database schema needs to support both legacy and new features",
            ("and then John mentioned that we should refactor", "the database schema needs to support both legacy and new features"),
        ),
        // Code review discussion
        (
            "if you look at this pull request you'll see that I've implemented the new authentication",
            "authentication system using JWT tokens and refresh mechanisms",
            ("if you look at this pull request you'll see that I've implemented the new", "authentication system using JWT tokens and refresh mechanisms"),
        ),
    ];

    for (prev, current, expected) in test_cases {
        let mut result = TranscriptionResult {
            input: AudioInput::default(),
            transcription: Some(current.to_string()),
            timestamp: 0,
            error: None,
        };

        if let Some((cleaned_prev, cleaned_current)) =
            result.cleanup_overlap_llm(prev.to_string()).await?
        {
            assert_similar(
                &cleaned_prev,
                expected.0,
                &format!("Previous segment for input: '{}'", prev),
                SIMILARITY_THRESHOLD,
            );
            assert_similar(
                &cleaned_current,
                expected.1,
                &format!("Current segment for input: '{}'", current),
                SIMILARITY_THRESHOLD,
            );
        } else {
            panic!(
                "cleanup_overlap_llm returned None for case: prev='{}', current='{}'",
                prev, current
            );
        }
    }

    Ok(())
}

#[tokio::test]
async fn test_cleanup_overlap_llm_challenging_cases() -> Result<()> {
    const SIMILARITY_THRESHOLD: f64 = 0.75; // Lower threshold for more challenging cases

    let test_cases = vec![
        // Fast speech with repetition
        (
            "yeah yeah yeah so basically what we need to do is implement the feature",
            "implement the feature using the new API endpoints we discussed",
            (
                "yeah yeah yeah so basically what we need to do is",
                "implement the feature using the new API endpoints we discussed",
            ),
        ),
        // Technical terms with numbers
        (
            "we're seeing about 200 milliseconds latency in the p99 metrics",
            "p99 metrics show some concerning patterns in the production environment",
            (
                "we're seeing about 200 milliseconds latency in the",
                "p99 metrics show some concerning patterns in the production environment",
            ),
        ),
        // Multiple speakers cross-talk
        (
            "I think we should- no but the problem is- yes exactly the database",
            "the database needs to be migrated first before we proceed",
            (
                "I think we should- no but the problem is- yes exactly",
                "the database needs to be migrated first before we proceed",
            ),
        ),
        // Speech with background noise markers
        (
            "[background noise] we need to optimize the performance of this query [typing sounds]",
            "this query is causing significant load on our production servers",
            (
                "we need to optimize the performance of",
                "this query is causing significant load on our production servers",
            ),
        ),
        // Non-native speaker patterns
        (
            "how you say... ah yes... the implementation must handle the edge cases",
            "edge cases like null values and undefined parameters",
            (
                "how you say... ah yes... the implementation must handle",
                "edge cases like null values and undefined parameters",
            ),
        ),
    ];

    for (prev, current, expected) in test_cases {
        let mut result = TranscriptionResult {
            input: AudioInput::default(),
            transcription: Some(current.to_string()),
            timestamp: 0,
            error: None,
        };

        if let Some((cleaned_prev, cleaned_current)) =
            result.cleanup_overlap_llm(prev.to_string()).await?
        {
            assert_similar(
                &cleaned_prev,
                expected.0,
                &format!("Previous segment for challenging case: '{}'", prev),
                SIMILARITY_THRESHOLD,
            );
            assert_similar(
                &cleaned_current,
                expected.1,
                &format!("Current segment for challenging case: '{}'", current),
                SIMILARITY_THRESHOLD,
            );
        } else {
            panic!(
                "cleanup_overlap_llm returned None for challenging case: prev='{}', current='{}'",
                prev, current
            );
        }
    }

    Ok(())
}

#[tokio::test]
async fn test_cleanup_overlap_llm_edge_cases() -> Result<()> {
    const SIMILARITY_THRESHOLD: f64 = 0.7; // Even lower threshold for edge cases

    let test_cases = vec![
        // Very long technical explanation
        (
            "so when we're implementing the distributed system architecture we need to consider the eventual consistency model and how it affects our data replication strategy across multiple nodes",
            "data replication strategy across multiple nodes requires careful consideration of network partitioning and conflict resolution mechanisms",
            ("so when we're implementing the distributed system architecture we need to consider the eventual consistency model and how it affects our", "data replication strategy across multiple nodes requires careful consideration of network partitioning and conflict resolution mechanisms"),
        ),
        // Short utterances
        (
            "um yeah okay",
            "okay let's see",
            ("um yeah", "okay let's see"),
        ),
        // Repeated technical terms
        (
            "kubernetes kubernetes kubernetes we need to configure the kubernetes deployment",
            "kubernetes deployment needs proper resource limits and requests",
            ("kubernetes kubernetes kubernetes we need to configure the", "kubernetes deployment needs proper resource limits and requests"),
        ),
        // Mixed language
        (
            "we need to implement cette fonctionnalité quickly",
            "quickly and efficiently without breaking existing code",
            ("we need to implement cette fonctionnalité", "quickly and efficiently without breaking existing code"),
        ),
        // Code snippets in speech
        (
            "so you write console dot log open parenthesis quote hello world quote close parenthesis",
            "console dot log and then we can add more debugging statements",
            ("so you write", "console dot log and then we can add more debugging statements"),
        ),
    ];

    for (prev, current, expected) in test_cases {
        let mut result = TranscriptionResult {
            input: AudioInput::default(),
            transcription: Some(current.to_string()),
            timestamp: 0,
            error: None,
        };

        if let Some((cleaned_prev, cleaned_current)) =
            result.cleanup_overlap_llm(prev.to_string()).await?
        {
            assert_similar(
                &cleaned_prev,
                expected.0,
                &format!("Previous segment for edge case: '{}'", prev),
                SIMILARITY_THRESHOLD,
            );
            assert_similar(
                &cleaned_current,
                expected.1,
                &format!("Current segment for edge case: '{}'", current),
                SIMILARITY_THRESHOLD,
            );
        } else {
            panic!(
                "cleanup_overlap_llm returned None for edge case: prev='{}', current='{}'",
                prev, current
            );
        }
    }

    Ok(())
}

#[tokio::test]
async fn test_cleanup_overlap_comparison() -> Result<()> {
    let test_cases = vec![
        // Common case: Speaker finishing a sentence
        (
            "so what I'm trying to explain is that the neural network",
            "neural network architecture consists of multiple layers",
            ("so what I'm trying to explain is that the", "neural network architecture consists of multiple layers"),
        ),
        // Interruption mid-sentence
        (
            "let me show you how to implement this feature in the code base",
            "in the code base we need to first initialize the configuration",
            ("let me show you how to implement this feature", "in the code base we need to first initialize the configuration"),
        ),
        // Technical discussion with specific terms
        (
            "when you're using async await in rust you need to understand the tokio runtime",
            "the tokio runtime handles all the asynchronous tasks efficiently",
            ("when you're using async await in rust you need to understand", "the tokio runtime handles all the asynchronous tasks efficiently"),
        ),
        // Meeting context with multiple speakers
        (
            "and then John mentioned that we should refactor the database schema",
            "the database schema needs to support both legacy and new features",
            ("and then John mentioned that we should refactor", "the database schema needs to support both legacy and new features"),
        ),
        // Code review discussion
        (
            "if you look at this pull request you'll see that I've implemented the new authentication",
            "authentication system using JWT tokens and refresh mechanisms",
            ("if you look at this pull request you'll see that I've implemented the new", "authentication system using JWT tokens and refresh mechanisms"),
        ),
        // Messy stuttering and self-correction
        (
            "i- i- i think we should- no wait, let me rephrase that- the architecture should be",
            "the architecture should be more scalable and cloud native",
            ("i- i- i think we should- no wait, let me rephrase that", "the architecture should be more scalable and cloud native"),
        ),
        // Background noise and partial words
        (
            "[keyboard typing] the perfor- performance metrics show that the latenc- [cough]",
            "latency spikes during peak hours need investigation",
            ("the perfor- performance metrics show that the", "latency spikes during peak hours need investigation"),
        ),
        // Multiple speakers talking over each other
        (
            "but the database- [crosstalk] no listen- the database queries are-",
            "are causing deadlocks we need to optimize the transaction isolation",
            ("but the database- no listen- the database queries", "are causing deadlocks we need to optimize the transaction isolation"),
        ),
        // Non-native speaker with filler words
        (
            "how you say... mmm... the thing is... the memory consumption is like... very high",
            "very high and we need to implement proper garbage collection",
            ("how you say... mmm... the thing is... the memory consumption is", "very high and we need to implement proper garbage collection"),
        ),
        // Technical terms with hesitation
        (
            "we need to implement the... um... what's it called... the circuit breaker pattern",
            "circuit breaker pattern to handle downstream service failures",
            ("we need to implement the... um... what's it called... the", "circuit breaker pattern to handle downstream service failures"),
        ),
        // Whisper hallucinating punctuation and formatting
        (
            "okay. so... [00:00:15] The thing about the API is that...",
            "API needs to handle rate limiting and back-off strategies properly",
            ("okay so the thing about the", "API needs to handle rate limiting and back-off strategies properly"),
        ),
        // Misheard technical terms
        (
            "we need to configure the darker compose file for deployment",  // docker -> darker
            "doctor compose needs environment variables and volume mounts", // docker -> doctor
            ("we need to configure the", "docker compose needs environment variables and volume mounts"),
        ),
        // Speaker identification confusion
        (
            "SPEAKER 1: yeah the code is SPEAKER 2: no let me SPEAKER 1: breaking in production",
            "breaking in production because of memory leaks",
            ("yeah the code is breaking in", "production because of memory leaks"),
        ),
        // Common word substitutions and phonetic errors
        (
            "the cash system isn't working wright now",  // cache -> cash, right -> wright
            "write now we need to implement proper catching mechanism", // right -> write, caching -> catching
            ("the cache system isn't working right", "now we need to implement proper caching mechanism"),
        ),
        // Numbers and special characters confusion
        (
            "the API v2.0 point oh returns for 04 error",  // 404 -> for 04
            "4 oh 4 errors need proper air handling", // error -> air
            ("the API v2.0 returns 404", "errors need proper error handling"),
        ),
        // Mixed languages and accents
        (
            "le system needs to handle ze exception throwing", // french accent
            "exception throwing must be consistent across ze codebase",
            ("the system needs to handle the", "exception throwing must be consistent across the codebase"),
        ),
        // Background noise interpreted as words
        (
            "[typing] hmmmmmm [mouse click] the code base needs refactoring [background chatter]",
            "[door closes] refactoring to improve maintainability",
            ("the code base needs", "refactoring to improve maintainability"),
        ),
        // Repeated words and false starts
        (
            "the the the database query query is is slow slow because",
            "because of missing indexes and poor optimization",
            ("the database query is slow", "because of missing indexes and poor optimization"),
        ),
        // Completely mangled technical terms
        (
            "we use post grass queue well with type script",  // PostgreSQL
            "type script and no js for the backend", // Node.js
            ("we use PostgreSQL with", "TypeScript and Node.js for the backend"),
        ),
        // Silent parts interpreted as mumbling
            (
            "mhmm [silence] uhhhh [silence] mmmmm the code",
            "the code needs better documentation",
            ("the code", "needs better documentation"),
        ),
    ];

    let mut llm_total_time = std::time::Duration::new(0, 0);
    let mut basic_total_time = std::time::Duration::new(0, 0);
    let mut llm_accuracy = Vec::new();
    let mut basic_accuracy = Vec::new();
    let total_cases = test_cases.len();

    for (prev, current, expected) in test_cases {
        let mut result = TranscriptionResult {
            input: AudioInput::default(),
            transcription: Some(current.to_string()),
            timestamp: 0,
            error: None,
        };

        // LLM method
        let llm_start = Instant::now();
        if let Some((cleaned_prev, cleaned_current)) =
            result.cleanup_overlap_llm(prev.to_string()).await?
        {
            llm_total_time += llm_start.elapsed();

            let prev_sim =
                normalized_levenshtein(&cleaned_prev.to_lowercase(), &expected.0.to_lowercase());
            let cur_sim =
                normalized_levenshtein(&cleaned_current.to_lowercase(), &expected.1.to_lowercase());
            llm_accuracy.push((prev_sim + cur_sim) / 2.0);
        }

        // Basic method
        let basic_start = Instant::now();
        if let Some((cleaned_prev, cleaned_current)) = result.cleanup_overlap(prev.to_string()) {
            basic_total_time += basic_start.elapsed();

            let prev_sim =
                normalized_levenshtein(&cleaned_prev.to_lowercase(), &expected.0.to_lowercase());
            let cur_sim =
                normalized_levenshtein(&cleaned_current.to_lowercase(), &expected.1.to_lowercase());
            basic_accuracy.push((prev_sim + cur_sim) / 2.0);
        }
    }

    let llm_avg_accuracy = llm_accuracy.iter().sum::<f64>() / llm_accuracy.len() as f64;
    let basic_avg_accuracy = basic_accuracy.iter().sum::<f64>() / basic_accuracy.len() as f64;

    println!("\nperformance & accuracy summary:");
    println!("total cases: {}", total_cases);
    println!(
        "llm: time={:?}, avg_time={:?}, accuracy={:.2}",
        llm_total_time,
        llm_total_time / total_cases as u32,
        llm_avg_accuracy
    );
    println!(
        "basic: time={:?}, avg_time={:?}, accuracy={:.2}",
        basic_total_time,
        basic_total_time / total_cases as u32,
        basic_avg_accuracy
    );
    println!(
        "llm is {:.2}x slower but {:.2}x more accurate",
        llm_total_time.as_secs_f64() / basic_total_time.as_secs_f64(),
        llm_avg_accuracy / basic_avg_accuracy
    );

    Ok(())
}
