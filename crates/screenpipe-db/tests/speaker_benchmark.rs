/// Speaker diarization benchmark
///
/// Runs against the real DB at `~/.screenpipe/db.sqlite` to measure
/// speaker clustering quality. Outputs metrics only — no PII leaves the machine.
///
/// Run with: cargo test -p screenpipe-db --test speaker_benchmark -- --nocapture --ignored
#[cfg(test)]
mod speaker_benchmark {
    use screenpipe_db::DatabaseManager;
    use std::collections::HashMap;

    /// Cosine similarity between two f32 slices
    fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
        let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
        let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm_a == 0.0 || norm_b == 0.0 {
            return 0.0;
        }
        dot / (norm_a * norm_b)
    }

    /// Cosine distance (1 - similarity), matching sqlite-vec's vec_distance_cosine
    fn cosine_distance(a: &[f32], b: &[f32]) -> f32 {
        1.0 - cosine_similarity(a, b)
    }

    #[derive(Debug)]
    struct EmbeddingRow {
        id: i64,
        speaker_id: i64,
        embedding: Vec<f32>,
    }

    #[derive(Debug)]
    struct SpeakerInfo {
        id: i64,
        name: Option<String>,
        transcription_count: i64,
    }

    #[tokio::test]
    #[ignore] // only runs manually — needs real DB
    async fn benchmark_speaker_clustering() {
        let db_path = dirs::home_dir()
            .unwrap()
            .join(".screenpipe")
            .join("db.sqlite");

        if !db_path.exists() {
            println!("SKIP: no DB at {}", db_path.display());
            return;
        }

        let db = DatabaseManager::new(db_path.to_str().unwrap())
            .await
            .expect("failed to open DB");

        // ── 1. Load all embeddings ──────────────────────────────────────
        let rows: Vec<(i64, i64, Vec<u8>)> =
            sqlx::query_as("SELECT id, speaker_id, embedding FROM speaker_embeddings")
                .fetch_all(&db.pool)
                .await
                .unwrap();

        let embeddings: Vec<EmbeddingRow> = rows
            .into_iter()
            .filter_map(|(id, speaker_id, blob)| {
                if blob.len() != 512 * 4 {
                    return None; // skip malformed
                }
                let embedding: Vec<f32> = blob
                    .chunks_exact(4)
                    .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
                    .collect();
                Some(EmbeddingRow {
                    id,
                    speaker_id,
                    embedding,
                })
            })
            .collect();

        println!("loaded {} embeddings", embeddings.len());

        // ── 2. Load speaker info ────────────────────────────────────────
        let speaker_rows: Vec<(i64, Option<String>, i64)> = sqlx::query_as(
            "SELECT s.id, s.name, COUNT(at.id) as cnt
             FROM speakers s
             LEFT JOIN audio_transcriptions at ON s.id = at.speaker_id
             GROUP BY s.id",
        )
        .fetch_all(&db.pool)
        .await
        .unwrap();

        let speakers: Vec<SpeakerInfo> = speaker_rows
            .into_iter()
            .map(|(id, name, cnt)| SpeakerInfo {
                id,
                name: name.filter(|n| !n.is_empty()),
                transcription_count: cnt,
            })
            .collect();

        let total_speakers = speakers.len();
        let named_speakers: Vec<&SpeakerInfo> =
            speakers.iter().filter(|s| s.name.is_some()).collect();
        let speakers_with_transcriptions = speakers
            .iter()
            .filter(|s| s.transcription_count > 0)
            .count();
        let hallucination_speakers = speakers
            .iter()
            .filter(|s| s.transcription_count <= 1 && s.name.is_none())
            .count();

        println!("\n═══ SPEAKER OVERVIEW ═══");
        println!("total speakers:              {}", total_speakers);
        println!("named speakers:              {}", named_speakers.len());
        for s in &named_speakers {
            println!(
                "  {} (id={}, {} transcriptions)",
                s.name.as_ref().unwrap(),
                s.id,
                s.transcription_count
            );
        }
        println!(
            "speakers with transcriptions:{}",
            speakers_with_transcriptions
        );
        println!(
            "hallucination speakers (≤1 transcription, unnamed): {} ({:.1}%)",
            hallucination_speakers,
            hallucination_speakers as f64 / total_speakers as f64 * 100.0
        );

        // ── 3. Build speaker→embeddings map ────────────────────────────
        let mut speaker_embeddings: HashMap<i64, Vec<&[f32]>> = HashMap::new();
        for e in &embeddings {
            speaker_embeddings
                .entry(e.speaker_id)
                .or_default()
                .push(&e.embedding);
        }

        // ── 4. Intra-speaker distance (for speakers with >1 embedding) ─
        let mut intra_distances: Vec<f32> = Vec::new();
        for (_sid, embs) in &speaker_embeddings {
            if embs.len() < 2 {
                continue;
            }
            for i in 0..embs.len() {
                for j in (i + 1)..embs.len() {
                    intra_distances.push(cosine_distance(embs[i], embs[j]));
                }
            }
        }

        // ── 5. Inter-speaker distance (sample to keep it fast) ─────────
        // Only compare centroids to avoid O(n²) on 672 speakers
        let centroids: Vec<(i64, Vec<f32>)> = speaker_embeddings
            .iter()
            .map(|(&sid, embs)| {
                let dim = embs[0].len();
                let mut centroid = vec![0.0f32; dim];
                for e in embs {
                    for (i, v) in e.iter().enumerate() {
                        centroid[i] += v;
                    }
                }
                let n = embs.len() as f32;
                for v in &mut centroid {
                    *v /= n;
                }
                (sid, centroid)
            })
            .collect();

        let mut inter_distances: Vec<f32> = Vec::new();
        // Sample: compare each centroid against up to 50 random others
        let sample_limit = 50.min(centroids.len());
        for i in 0..centroids.len() {
            for j in (i + 1)..centroids.len().min(i + 1 + sample_limit) {
                inter_distances.push(cosine_distance(&centroids[i].1, &centroids[j].1));
            }
        }

        let avg_intra = if intra_distances.is_empty() {
            f32::NAN
        } else {
            intra_distances.iter().sum::<f32>() / intra_distances.len() as f32
        };
        let avg_inter = if inter_distances.is_empty() {
            f32::NAN
        } else {
            inter_distances.iter().sum::<f32>() / inter_distances.len() as f32
        };

        println!("\n═══ EMBEDDING DISTANCES ═══");
        println!(
            "avg intra-speaker distance:  {:.4} (from {} pairs across {} multi-embedding speakers)",
            avg_intra,
            intra_distances.len(),
            speaker_embeddings.values().filter(|v| v.len() > 1).count()
        );
        println!(
            "avg inter-speaker distance:  {:.4} (from {} centroid pairs)",
            avg_inter,
            inter_distances.len()
        );
        println!(
            "separation gap:              {:.4} (inter - intra, higher = better)",
            avg_inter - avg_intra
        );

        // ── 6. Named speaker analysis ──────────────────────────────────
        // For each named speaker, find all unnamed speakers whose embeddings
        // are closer than the current threshold (0.5 distance)
        println!("\n═══ NAMED SPEAKER ANALYSIS ═══");
        for named in &named_speakers {
            if let Some(named_embs) = speaker_embeddings.get(&named.id) {
                let named_centroid = &centroids.iter().find(|(id, _)| *id == named.id).unwrap().1;

                let mut close_speakers: Vec<(i64, f32, i64)> = Vec::new(); // (id, distance, transcription_count)
                for (sid, centroid) in &centroids {
                    if *sid == named.id {
                        continue;
                    }
                    let dist = cosine_distance(named_centroid, centroid);
                    if dist < 0.5 {
                        let tc = speakers
                            .iter()
                            .find(|s| s.id == *sid)
                            .map(|s| s.transcription_count)
                            .unwrap_or(0);
                        close_speakers.push((*sid, dist, tc));
                    }
                }
                close_speakers.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());

                let missed_transcriptions: i64 = close_speakers.iter().map(|(_, _, tc)| tc).sum();

                println!(
                    "\n  {} (id={}, {} transcriptions, {} embeddings):",
                    named.name.as_ref().unwrap(),
                    named.id,
                    named.transcription_count,
                    named_embs.len()
                );
                println!(
                    "    {} close unnamed speakers (dist < 0.5) with {} total transcriptions",
                    close_speakers.len(),
                    missed_transcriptions
                );
                for (sid, dist, tc) in close_speakers.iter().take(10) {
                    println!(
                        "      speaker #{}: dist={:.4}, {} transcriptions",
                        sid, dist, tc
                    );
                }
                if close_speakers.len() > 10 {
                    println!("      ... and {} more", close_speakers.len() - 10);
                }
            }
        }

        // ── 7. Threshold sweep ─────────────────────────────────────────
        println!("\n═══ THRESHOLD SWEEP ═══");
        println!("(simulating: if we merged all speakers within distance X, how many remain?)");
        println!("{:<12} {:>10}", "threshold", "speakers");
        println!("{:<12} {:>10}", "---------", "--------");

        for threshold_pct in (5..=95).step_by(5) {
            let threshold = threshold_pct as f32 / 100.0;

            // Simple greedy clustering: assign each embedding to first cluster within threshold
            let mut clusters: Vec<Vec<f32>> = Vec::new(); // centroid per cluster

            for (_, centroid) in &centroids {
                let mut found = false;
                for cluster_centroid in &clusters {
                    if cosine_distance(centroid, cluster_centroid) < threshold {
                        found = true;
                        break;
                    }
                }
                if !found {
                    clusters.push(centroid.clone());
                }
            }

            let marker = if threshold_pct == 50 {
                " <-- current"
            } else {
                ""
            };
            println!("{:<12.2} {:>10}{}", threshold, clusters.len(), marker);
        }

        // ── 8. Temporal stability ──────────────────────────────────────
        // Look at 5-minute windows: how many distinct speakers appear?
        let temporal_rows: Vec<(i64,)> = sqlx::query_as(
            "SELECT COUNT(DISTINCT speaker_id) as n
             FROM audio_transcriptions
             WHERE speaker_id IS NOT NULL
             GROUP BY strftime('%Y-%m-%d %H', timestamp),
                      CAST(strftime('%M', timestamp) AS INTEGER) / 5",
        )
        .fetch_all(&db.pool)
        .await
        .unwrap();

        let temporal_counts: Vec<i64> = temporal_rows.into_iter().map(|(n,)| n).collect();
        let avg_speakers_per_window = if temporal_counts.is_empty() {
            0.0
        } else {
            temporal_counts.iter().sum::<i64>() as f64 / temporal_counts.len() as f64
        };
        let max_speakers_per_window = temporal_counts.iter().max().copied().unwrap_or(0);

        println!("\n═══ TEMPORAL STABILITY ═══");
        println!("(distinct speaker IDs per 5-minute window)");
        println!("windows analyzed:            {}", temporal_counts.len());
        println!(
            "avg speakers per window:     {:.1}",
            avg_speakers_per_window
        );
        println!("max speakers in one window:  {}", max_speakers_per_window);

        // Distribution
        let mut dist: HashMap<i64, usize> = HashMap::new();
        for &c in &temporal_counts {
            *dist.entry(c).or_default() += 1;
        }
        let mut dist_sorted: Vec<(i64, usize)> = dist.into_iter().collect();
        dist_sorted.sort();
        println!("distribution:");
        for (speakers, windows) in &dist_sorted {
            println!("  {} speakers: {} windows", speakers, windows);
        }

        // ── 9. Top speakers by transcription share ─────────────────────
        let total_transcriptions: i64 = speakers.iter().map(|s| s.transcription_count).sum();
        let mut sorted_speakers: Vec<&SpeakerInfo> = speakers
            .iter()
            .filter(|s| s.transcription_count > 0)
            .collect();
        sorted_speakers.sort_by(|a, b| b.transcription_count.cmp(&a.transcription_count));

        println!("\n═══ TOP 20 SPEAKERS BY TRANSCRIPTION COUNT ═══");
        println!("{:<8} {:<15} {:>8} {:>8}", "id", "name", "count", "share%");
        for s in sorted_speakers.iter().take(20) {
            println!(
                "{:<8} {:<15} {:>8} {:>7.1}%",
                s.id,
                s.name.as_deref().unwrap_or("(unnamed)"),
                s.transcription_count,
                s.transcription_count as f64 / total_transcriptions as f64 * 100.0
            );
        }

        println!("\n═══ SUMMARY ═══");
        println!(
            "fragmentation ratio:         {:.4} (named / total, 1.0 = perfect)",
            named_speakers.len() as f64 / total_speakers as f64
        );
        println!(
            "hallucination rate:          {:.1}%",
            hallucination_speakers as f64 / total_speakers as f64 * 100.0
        );
        println!("avg intra-speaker distance:  {:.4}", avg_intra);
        println!("avg inter-speaker distance:  {:.4}", avg_inter);
        println!("separation gap:              {:.4}", avg_inter - avg_intra);
        println!(
            "avg speakers per 5min:       {:.1}",
            avg_speakers_per_window
        );
        println!("total transcriptions:        {}", total_transcriptions);
    }
}
