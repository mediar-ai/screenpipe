use ndarray::{Array2, Axis};
use rust_stemmers::{Algorithm, Stemmer};
use sqlx::{query_as, sqlite::SqlitePool};
use std::collections::{HashMap, HashSet};
use std::error::Error;
use tracing::debug;

fn keep_least_similar(chunks: &[String], percentage: f64) -> Vec<usize> {
    if chunks.is_empty() {
        return vec![];
    }

    let en_stemmer = Stemmer::create(Algorithm::English);
    let mut term_freq = HashMap::new();
    let mut doc_freq = HashMap::new();

    // Calculate TF-IDF
    for (doc_id, chunk) in chunks.iter().enumerate() {
        let words: Vec<_> = chunk
            .split_whitespace()
            .map(|word| en_stemmer.stem(word).to_string())
            .collect();

        for word in words.iter() {
            *term_freq.entry((doc_id, word.clone())).or_insert(0) += 1;
            doc_freq
                .entry(word.clone())
                .or_insert_with(HashSet::new)
                .insert(doc_id);
        }
    }

    let n_docs = chunks.len();
    let mut tfidf_matrix = Array2::zeros((n_docs, n_docs));

    for ((doc_id, term), count) in term_freq.iter() {
        let df = doc_freq[term].len() as f64;
        let idf = (n_docs as f64 / df).ln();
        let tfidf = (*count as f64) * idf;
        tfidf_matrix[[*doc_id, *doc_id]] += tfidf * tfidf;
    }

    // Calculate cosine similarity
    let norms = tfidf_matrix.diag().mapv(f64::sqrt);
    for i in 0..n_docs {
        for j in 0..n_docs {
            if norms[i] != 0.0 && norms[j] != 0.0 {
                tfidf_matrix[[i, j]] /= norms[i] * norms[j];
            }
        }
    }

    let avg_similarities: Vec<_> = match tfidf_matrix.mean_axis(Axis(1)) {
        Some(mean) => mean.into_iter().enumerate().collect(),
        None => return vec![],
    };

    let mut sorted_similarities = avg_similarities.clone();
    sorted_similarities.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

    let keep_count = (percentage * n_docs as f64) as usize;
    sorted_similarities
        .into_iter()
        .take(keep_count)
        .map(|(i, _)| i)
        .collect()
}

fn word_count(text: &str) -> usize {
    text.split_whitespace().count()
}

pub async fn filter_texts(
    timestamp: &str,
    memory_source: &str,
    pool: &SqlitePool,
) -> Result<String, Box<dyn Error + Send + Sync>> {
    let texts: Vec<String> = query_as(
        "
        SELECT cti.text
        FROM chunked_text_index cti
        JOIN chunked_text_entries cte ON cti.text_id = cte.text_id
        WHERE cte.timestamp > ? AND cte.source = ?
        GROUP BY cti.text_id
        ORDER BY MAX(cte.timestamp) DESC
    ",
    )
    .bind(timestamp)
    .bind(memory_source)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row: (String,)| row.0)
    .collect();

    let initial_text_count = texts.len();
    let initial_word_count: usize = texts.iter().map(|text| word_count(text)).sum();
    debug!(
        "Initial: {} texts, {} words",
        initial_text_count, initial_word_count
    );

    if texts.is_empty() {
        return Ok("".to_string());
    }

    let kept_indices = keep_least_similar(&texts, 0.1);
    let kept_texts: Vec<_> = kept_indices.iter().map(|&i| &texts[i]).collect();

    let final_text_count = kept_texts.len();
    let final_word_count: usize = kept_texts.iter().map(|&text| word_count(text)).sum();
    debug!(
        "Kept: {} texts, {} words",
        final_text_count, final_word_count
    );

    let output = kept_texts
        .iter()
        .map(|s| s.as_str())
        .collect::<Vec<&str>>()
        .join("\n");

    Ok(output)
}
