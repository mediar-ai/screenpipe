// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

use super::*;

/// Absolute offsets recomputed from current source rows, including previously
/// acknowledged rows at the same timestamp. Deleting an earlier row shifts
/// those offsets too; subtracting only deleted outgoing rows would skip data.
#[derive(Default)]
pub struct ExportFilterReport {
    pub frames: Option<(String, u32)>,
    pub audio: Option<(String, u32)>,
    pub ui: Option<(String, u32)>,
    pub memories: Option<(String, u32)>,
    pub parsed: Option<(String, u32)>,
}

impl ExportFilterReport {
    pub(super) fn apply(self, cursor: &mut Cursor) {
        for (current, offset, fresh) in [
            (
                &cursor.last_frame_ts,
                &mut cursor.boundary.frames,
                self.frames,
            ),
            (
                &cursor.last_audio_ts,
                &mut cursor.boundary.audio,
                self.audio,
            ),
            (&cursor.last_ui_ts, &mut cursor.boundary.ui, self.ui),
            (
                &cursor.last_memory_ts,
                &mut cursor.boundary.memories,
                self.memories,
            ),
            (
                &cursor.last_parsed_ts,
                &mut cursor.boundary.parsed,
                self.parsed,
            ),
        ] {
            if let Some((timestamp, count)) = fresh {
                if current.as_deref() == Some(timestamp.as_str()) {
                    *offset = count;
                }
            }
        }
    }
}

/// Each HTTP request is filtered again after any preceding network wait.
/// A deletion while an earlier request is in flight must not leak through the
/// already serialized remainder of a large page.
pub(super) async fn filter_request(
    cfg: &EnterpriseSyncConfig,
    export: Option<&dyn ExportFilter>,
    local: &dyn LocalApiClient,
    body: Vec<u8>,
    cursor: &mut Cursor,
    ratings_only: bool,
) -> Result<(Vec<u8>, SyncTickReport), EnterpriseSyncError> {
    let mut frames = Vec::new();
    let mut audio = Vec::new();
    let mut ui = Vec::new();
    let mut snapshots = Vec::new();
    let mut memories = Vec::new();
    let mut parsed = Vec::new();
    let mut activities = Vec::new();
    let mut feedback = Vec::new();
    for line in body
        .split(|byte| *byte == b'\n')
        .filter(|line| !line.is_empty())
    {
        let record: TelemetryRecord = serde_json::from_slice(line)
            .map_err(|e| EnterpriseSyncError::LocalApi(format!("decode prepared export: {e}")))?;
        match record {
            TelemetryRecord::Frame { frame, .. } => frames.push(frame),
            TelemetryRecord::Audio { audio: row, .. } => audio.push(row),
            TelemetryRecord::Ui { ui: row, .. } => ui.push(row),
            TelemetryRecord::Snapshot { snapshot, .. } => snapshots.push(snapshot),
            TelemetryRecord::Memory { memory, .. } => memories.push(memory),
            TelemetryRecord::Parsed { parsed: row, .. } => parsed.push(row),
            TelemetryRecord::Activity { activity, .. } => activities.push(activity),
            TelemetryRecord::Feedback { feedback: row, .. } => feedback.push(row),
        }
    }
    drop(body);
    if let Some(export) = export {
        export
            .filter(
                &mut ExportRows {
                    frames: &mut frames,
                    audio: &mut audio,
                    ui: &mut ui,
                    snapshots: &mut snapshots,
                    memories: &mut memories,
                    parsed: &mut parsed,
                    activities: &mut activities,
                    feedback: &mut feedback,
                },
                local,
            )
            .await?
            .apply(cursor);
    }
    if ratings_only {
        for row in &mut feedback {
            row.comment = None;
            row.snapshot = None;
            row.context = serde_json::json!({});
        }
    }
    let mut body = screenpipe_telemetry_wire::build_jsonl_with_semantic_streams(
        &cfg.device_id,
        &cfg.device_label,
        &frames,
        &parsed,
        &activities,
        &audio,
        &ui,
        &snapshots,
        &memories,
    );
    body.extend_from_slice(&screenpipe_telemetry_wire::build_feedback_jsonl(
        &cfg.device_id,
        &cfg.device_label,
        &feedback,
    ));
    let report = SyncTickReport {
        frames: frames.len(),
        parsed: parsed.len(),
        activities: activities.len(),
        audio: audio.len(),
        ui: ui.len(),
        snapshots: snapshots.len(),
        memories: memories.len(),
        feedback: feedback.len(),
        bytes: body.len(),
        ..Default::default()
    };
    Ok((body, report))
}

/// Borrow the outgoing page so filtering keeps the original selection and order.
pub struct ExportRows<'a> {
    pub frames: &'a mut Vec<FrameRow>,
    pub audio: &'a mut Vec<AudioRow>,
    pub ui: &'a mut Vec<UiEventRow>,
    pub snapshots: &'a mut Vec<SnapshotRow>,
    pub memories: &'a mut Vec<MemoryRow>,
    pub parsed: &'a mut Vec<ParsedRow>,
    pub activities: &'a mut Vec<ActivityRow>,
    pub feedback: &'a mut Vec<FeedbackRow>,
}

impl ExportRows<'_> {
    pub async fn refresh(
        &mut self,
        local: &dyn LocalApiClient,
    ) -> Result<ExportFilterReport, EnterpriseSyncError> {
        let mut report = ExportFilterReport::default();
        report.frames = filter_current_rows(
            self.frames,
            FRAME_PAGE_LIMIT,
            |r| r.frame_id,
            |r| r.timestamp.as_str(),
            |since, offset, limit| async move {
                local.fetch_frames_since(Some(&since), offset, limit).await
            },
        )
        .await?;
        // The local audio API identifies ordinary audio by chunk + timestamp,
        // and live meeting segments by a negative segment ID.
        report.audio = filter_current_rows(
            self.audio,
            PAGE_LIMIT,
            |r| (r.transcription_id, r.timestamp.clone()),
            |r| r.timestamp.as_str(),
            |since, offset, limit| async move {
                local.fetch_audio_since(Some(&since), offset, limit).await
            },
        )
        .await?;
        report.ui = filter_current_rows(
            self.ui,
            PAGE_LIMIT,
            |r| r.event_id,
            |r| r.timestamp.as_str(),
            |since, offset, limit| async move {
                local
                    .fetch_ui_events_since(Some(&since), offset, limit)
                    .await
            },
        )
        .await?;
        report.memories = filter_current_rows(
            self.memories,
            PAGE_LIMIT,
            |r| r.memory_id,
            |r| r.created_at.as_str(),
            |since, offset, limit| async move {
                local
                    .fetch_memories_since(Some(&since), offset, limit)
                    .await
            },
        )
        .await?;
        report.parsed = filter_current_rows(
            self.parsed,
            PAGE_LIMIT,
            |r| r.frame_id,
            |r| r.timestamp.as_str(),
            |since, offset, limit| async move {
                local.fetch_parsed_since(Some(&since), offset, limit).await
            },
        )
        .await?;
        if let Some(first) = self.feedback.first() {
            let mut since = first.updated_at.clone();
            let wanted: std::collections::HashSet<_> = self
                .feedback
                .iter()
                .map(|r| r.feedback_id.clone())
                .collect();
            let mut current = std::collections::HashMap::new();
            let mut after = None;
            loop {
                let page = local
                    .fetch_feedback_since(Some(&since), after.as_deref(), PAGE_LIMIT)
                    .await?;
                let more = page.len() == PAGE_LIMIT as usize;
                let Some(last) = page.last() else {
                    break;
                };
                since = last.updated_at.clone();
                after = Some(last.feedback_id.clone());
                for row in page {
                    if wanted.contains(&row.feedback_id) {
                        current.insert(row.feedback_id.clone(), row);
                    }
                }
                if !more || current.len() == wanted.len() {
                    break;
                }
            }
            self.feedback
                .retain_mut(|row| match current.remove(&row.feedback_id) {
                    Some(fresh) => {
                        *row = fresh;
                        true
                    }
                    None => false,
                });
        }
        if let Some(first) = self.activities.first() {
            let current = local.fetch_activities_since(Some(&first.start_at)).await?;
            let mut current: std::collections::HashMap<_, _> = current
                .into_iter()
                .map(|r| (r.activity_id.clone(), r))
                .collect();
            self.activities
                .retain_mut(|row| match current.remove(&row.activity_id) {
                    Some(fresh) => {
                        *row = fresh;
                        true
                    }
                    None => false,
                });
        }
        let mut snapshots = Vec::with_capacity(self.snapshots.len());
        for row in self.snapshots.iter() {
            let jpeg = match local.fetch_frame_jpeg(row.frame_id).await {
                Ok(jpeg) => jpeg,
                Err(EnterpriseSyncError::BackfillImages("screenshot_policy_disabled")) => None,
                Err(error) => return Err(error),
            };
            if let Some(jpeg) = jpeg {
                let id = row.frame_id;
                let timestamp = row.timestamp.clone();
                if let Some(fresh) =
                    tokio::task::spawn_blocking(move || snapshot_from_jpeg(id, timestamp, &jpeg))
                        .await
                        .map_err(|e| {
                            EnterpriseSyncError::LocalApi(format!("refresh snapshot: {e}"))
                        })?
                {
                    snapshots.push(fresh);
                }
            }
        }
        *self.snapshots = snapshots;
        Ok(report)
    }
}

/// Re-read only the selected time range, page through timestamp ties, and keep
/// the selected IDs that still exist. Current contents replace stale/redacted
/// copies. New captures are left for the next page instead of joining this one.
async fn filter_current_rows<T, K, F, Fut>(
    selected: &mut Vec<T>,
    limit: u32,
    key: impl Fn(&T) -> K,
    timestamp: impl Fn(&T) -> &str,
    mut fetch: F,
) -> Result<Option<(String, u32)>, EnterpriseSyncError>
where
    K: Eq + std::hash::Hash,
    F: FnMut(String, u32, u32) -> Fut,
    Fut: std::future::Future<Output = Result<Vec<T>, EnterpriseSyncError>>,
{
    let (Some(first), Some(last)) = (selected.first(), selected.last()) else {
        return Ok(None);
    };
    let mut boundary_offset = 0u32;
    let mut rows_at_boundary = 0u32;
    let mut since = Some(timestamp(first).to_owned());
    let last_ts = timestamp(last).to_owned();
    let mut wanted = std::collections::HashMap::new();
    for row in selected.iter() {
        *wanted.entry(key(row)).or_insert(0usize) += 1;
    }
    let selected_count = selected.len();
    let mut matched = 0usize;
    let mut current: std::collections::HashMap<K, std::collections::VecDeque<T>> =
        std::collections::HashMap::new();
    let mut offset = 0;
    loop {
        let page = fetch(since.clone().unwrap(), offset, limit).await?;
        let more = page.len() == limit as usize;
        if page.is_empty() {
            break;
        }
        advance_timestamp_boundary(&mut since, &mut offset, &page, &timestamp);
        for row in page {
            let at_boundary = timestamp(&row) == last_ts;
            if at_boundary {
                rows_at_boundary += 1;
            }
            let id = key(&row);
            if let Some(count) = wanted.get(&id) {
                let values = current.entry(id).or_default();
                if values.len() < *count {
                    values.push_back(row);
                    matched += 1;
                    if at_boundary {
                        boundary_offset = rows_at_boundary;
                    }
                }
            }
        }
        if !more || since.as_deref().unwrap() > last_ts.as_str() || matched == selected_count {
            break;
        }
    }
    selected.retain_mut(
        |row| match current.get_mut(&key(row)).and_then(|rows| rows.pop_front()) {
            Some(fresh) => {
                *row = fresh;
                true
            }
            None => false,
        },
    );
    // With no surviving selected row at this timestamp, replay from its start.
    // Upload keys are idempotent; replay is preferable to skipping a new row.
    Ok(Some((last_ts, boundary_offset)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    fn frame(id: i64, text: &str) -> FrameRow {
        FrameRow {
            frame_id: id,
            timestamp: "2026-10-09T00:00:00Z".into(),
            app_name: None,
            window_name: None,
            browser_url: None,
            text: Some(text.into()),
            accessibility_tree: None,
        }
    }

    #[tokio::test]
    async fn deletion_filters_only_selected_ids_and_recomputes_shifted_timestamp_offset() {
        let mut selected = vec![
            frame(2, "deleted"),
            frame(3, "private"),
            frame(4, "deleted tail"),
        ];
        // Row 1 was acknowledged earlier and has also been deleted. Row 0 is
        // still present before this selection; row 5 is an unselected capture.
        let current = Arc::new(vec![
            frame(0, "earlier"),
            frame(3, "[REDACTED]"),
            frame(5, "new"),
        ]);
        let calls = Arc::new(Mutex::new(Vec::new()));
        let offset = filter_current_rows(&mut selected, 2, |r| r.frame_id, |r| &r.timestamp, {
            let calls = calls.clone();
            move |since, offset, limit| {
                let current = current.clone();
                let calls = calls.clone();
                async move {
                    calls.lock().unwrap().push((since, offset));
                    Ok(current
                        .iter()
                        .skip(offset as usize)
                        .take(limit as usize)
                        .cloned()
                        .collect())
                }
            }
        })
        .await
        .unwrap();
        assert_eq!(selected, vec![frame(3, "[REDACTED]")]);
        assert_eq!(
            offset,
            Some(("2026-10-09T00:00:00Z".into(), 2)),
            "count surviving earlier rows as well as selected rows"
        );
        assert_eq!(
            calls
                .lock()
                .unwrap()
                .iter()
                .map(|(_, offset)| *offset)
                .collect::<Vec<_>>(),
            vec![0, 2]
        );
    }

    #[tokio::test]
    async fn completely_deleted_selection_keeps_the_next_capture_for_the_next_page() {
        let mut selected = vec![frame(1, "deleted"), frame(2, "deleted")];
        let offset = filter_current_rows(
            &mut selected,
            2,
            |r| r.frame_id,
            |r| &r.timestamp,
            |_, _, _| async { Ok(vec![frame(3, "new capture")]) },
        )
        .await
        .unwrap();
        assert!(selected.is_empty());
        assert_eq!(offset, Some(("2026-10-09T00:00:00Z".into(), 0)));
    }

    #[tokio::test]
    async fn source_order_and_repeated_keys_are_preserved() {
        let mut selected = vec![frame(-2, "a"), frame(-2, "b"), frame(-3, "c")];
        let current = Arc::new(vec![
            frame(-1, "earlier"),
            frame(-2, "a redacted"),
            frame(-2, "b redacted"),
            frame(-3, "c redacted"),
            frame(-4, "new"),
        ]);
        let offset = filter_current_rows(
            &mut selected,
            2,
            |r| r.frame_id,
            |r| &r.timestamp,
            move |_, offset, limit| {
                let current = current.clone();
                async move {
                    Ok(current
                        .iter()
                        .skip(offset as usize)
                        .take(limit as usize)
                        .cloned()
                        .collect())
                }
            },
        )
        .await
        .unwrap();
        assert_eq!(
            selected,
            vec![
                frame(-2, "a redacted"),
                frame(-2, "b redacted"),
                frame(-3, "c redacted")
            ]
        );
        assert_eq!(offset, Some(("2026-10-09T00:00:00Z".into(), 4)));
    }

    #[tokio::test]
    async fn genuine_read_failure_preserves_the_selection_and_original_cause() {
        let mut selected = vec![frame(1, "pending")];
        let before = selected.clone();
        let error = filter_current_rows(
            &mut selected,
            2,
            |r| r.frame_id,
            |r| &r.timestamp,
            |_, _, _| async {
                Err(EnterpriseSyncError::LocalApi(
                    "database disk image is malformed".into(),
                ))
            },
        )
        .await
        .unwrap_err();
        assert!(error
            .to_string()
            .contains("database disk image is malformed"));
        assert_eq!(selected, before);
    }
}
