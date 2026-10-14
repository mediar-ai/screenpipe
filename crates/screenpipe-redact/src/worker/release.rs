// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

use super::Worker;
use crate::{RedactError, Redactor};
use std::collections::BTreeMap;

impl Worker {
    pub async fn process_release_batch(&self, limit: u32) -> Result<u32, anyhow::Error> {
        let Some(db) = &self.release_db else {
            return Ok(0);
        };
        let mut completed = 0;
        // Independent queues: a failing surface cannot stop unrelated ready data.
        for kind in [
            "frames", "audio", "input", "elements", "memory", "parsed", "segments",
        ] {
            let jobs = match db.release_pending(kind, (limit / 7).max(1)).await {
                Ok(jobs) => jobs,
                Err(error) => {
                    crate::notify_database_error(
                        self.database_error_hook.as_ref(),
                        &anyhow::Error::from(error),
                    );
                    continue;
                }
            };
            for job in jobs {
                let mut values = BTreeMap::new();
                let mut failure = None;
                for (column, value) in &job.values {
                    let result = match value {
                        Some(text) if !text.is_empty() => {
                            if column.ends_with("json")
                                || matches!(
                                    column.as_str(),
                                    "properties" | "element_ancestors" | "tags"
                                )
                            {
                                redact_json(text, self.redactor.as_ref()).await.map(Some)
                            } else {
                                self.redactor
                                    .redact_required(text)
                                    .await
                                    .map(|out| Some(out.redacted))
                            }
                        }
                        _ => Ok(value.clone()),
                    };
                    match result {
                        Ok(value) => {
                            values.insert(column.clone(), value);
                        }
                        Err(error) => {
                            failure = Some(error);
                            break;
                        }
                    }
                }
                if failure.is_some() {
                    db.defer_release(&job).await?;
                    self.status.lock().await.last_error =
                        Some("Required PII processing is pending; retry scheduled".into());
                    continue;
                }
                if db.publish_release(&job, &values).await? {
                    completed += 1;
                }
            }
        }
        Ok(completed)
    }
}

async fn redact_json(text: &str, redactor: &dyn Redactor) -> Result<String, RedactError> {
    let mut value: serde_json::Value = serde_json::from_str(text)
        .map_err(|_| RedactError::Unexpected("invalid structured privacy source".into()))?;
    let mut strings = Vec::new();
    collect(&value, String::new(), &mut strings);
    for (pointer, text) in strings {
        if text.is_empty() {
            continue;
        }
        let out = redactor.redact_required(&text).await?;
        if let Some(target) = value.pointer_mut(&pointer) {
            *target = serde_json::Value::String(out.redacted);
        }
    }
    serde_json::to_string(&value)
        .map_err(|_| RedactError::Unexpected("invalid structured privacy result".into()))
}
fn collect(value: &serde_json::Value, path: String, out: &mut Vec<(String, String)>) {
    match value {
        serde_json::Value::String(text) => out.push((path, text.clone())),
        serde_json::Value::Array(items) => {
            for (i, item) in items.iter().enumerate() {
                collect(item, format!("{path}/{i}"), out);
            }
        }
        serde_json::Value::Object(items) => {
            for (key, item) in items {
                collect(
                    item,
                    format!("{path}/{}", key.replace('~', "~0").replace('/', "~1")),
                    out,
                );
            }
        }
        _ => {}
    }
}
