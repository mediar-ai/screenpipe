// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
use serde_json::{json, Value};
use telemetry_ax_eval::records::{build_jsonl, parse_jsonl, AudioRow, FrameRow};
fn frame(id: i64, tree: Option<Value>) -> FrameRow {
    let mut row = json!({"frame_id":id,"timestamp":"2026-01-02T03:04:05Z","app_name":"Synthetic Editor","window_name":"Example","browser_url":null,"text":"Visible summary"});
    if let Some(value) = tree { row["accessibility_tree"] = value; }
    serde_json::from_value(row).unwrap()
}
fn wire(rows: &[FrameRow]) -> Vec<u8> { build_jsonl("device-synthetic", "Synthetic device", rows, &[], &[], &[], &[]) }
fn values(body: &[u8]) -> Vec<Value> {
    let parsed = parse_jsonl(body); assert_eq!(parsed.skipped_lines, 0);
    parsed.records.iter().map(|r| serde_json::to_value(r).unwrap()).collect()
}
#[test] fn full_tree_keeps_empty_nodes_and_unknown_properties() {
    let tree = json!([{"role":"Window","text":"","depth":0},{"role":"Button","text":"","depth":1,"bounds":[1,2,3,4],"properties":{"automation_id":"save","future":{"enabled":false,"number":0,"nothing":null}}}]);
    assert_eq!(values(&wire(&[frame(1,Some(tree.clone()))]))[0]["accessibility_tree"], tree);
}
#[test] fn nested_unicode_and_long_values_remain_complete() {
    let tree = json!([{"role":"TextField","text":"保存 🧪\nsecond line","properties":{"value":"x".repeat(32768),"children":[{"text":""}]}}]);
    assert_eq!(values(&wire(&[frame(2,Some(tree.clone()))]))[0]["accessibility_tree"], tree);
}
#[test] fn empty_tree_remains_distinct_from_absent_tree() {
    let row=values(&wire(&[frame(3,Some(json!([])))])); assert_eq!(row[0].get("accessibility_tree"),Some(&json!([])));
}
#[test] fn decoder_preserves_received_tree() {
    let tree=json!([{"properties":{"future":[1,false,null,"Ω"]}}]);
    let raw=json!({"kind":"frame","device_id":"other","device_label":"Other","frame_id":4,"timestamp":"2026-01-02T03:04:05Z","text":"summary","accessibility_tree":tree});
    assert_eq!(values(raw.to_string().as_bytes())[0]["accessibility_tree"],raw["accessibility_tree"]);
}
#[test] fn legacy_frame_without_tree_stays_readable_and_omits_tree() {
    let row=values(&wire(&[frame(5,None)])); assert!(row[0].get("accessibility_tree").is_none());assert_eq!(row[0]["text"],"Visible summary");
}
#[test] fn explicit_null_tree_remains_absent_on_wire() {
    let row=values(&wire(&[frame(6,Some(Value::Null))]));assert!(row[0].get("accessibility_tree").is_none());
}
#[test] fn frame_fields_and_device_identity_remain_unchanged() {
    let row=values(&wire(&[frame(7,None)]));let row=&row[0];
    assert_eq!(row["frame_id"],7);assert_eq!(row["timestamp"],"2026-01-02T03:04:05Z");assert_eq!(row["app_name"],"Synthetic Editor");assert_eq!(row["window_name"],"Example");assert_eq!(row["browser_url"],Value::Null);assert_eq!(row["text"],"Visible summary");assert_eq!(row["device_id"],"device-synthetic");assert_eq!(row["device_label"],"Synthetic device");assert_eq!(row["kind"],"frame");assert!(row.get("frame").is_none());
}
#[test] fn mixed_audio_survives_frame_encoding() {
    let audio:AudioRow=serde_json::from_value(json!({"transcription_id":9,"timestamp":"2026-01-02T03:04:06Z","transcription":"Synthetic speech","speaker":"Speaker 1","device":"microphone"})).unwrap();
    let body=build_jsonl("dev", "label", &[frame(8,None)], &[audio], &[], &[], &[]);let rows=values(&body);assert_eq!(rows.len(),2);assert_eq!(rows[1]["kind"],"audio");assert_eq!(rows[1]["transcription"],"Synthetic speech");assert_eq!(rows[1]["device_id"],"dev");
}
#[test] fn malformed_lines_do_not_poison_valid_neighbors() {
    let mut body=wire(&[frame(9,None)]);body.extend_from_slice(b"\n \t\n{broken\n{\"kind\":\"unknown\"}\n");body.extend(wire(&[frame(10,None)]));let parsed=parse_jsonl(&body);assert_eq!(parsed.skipped_lines,2);assert_eq!(parsed.records.len(),2);assert_eq!(parsed.records[1].device_id(),"device-synthetic");
}
#[test] fn duplicate_frame_ids_keep_order_and_distinct_payloads() {
    let a=frame(11,None);let mut b=frame(11,None);b.text=Some("later version".into());let rows=values(&wire(&[a,b]));assert_eq!(rows.len(),2);assert_eq!(rows[0]["text"],"Visible summary");assert_eq!(rows[1]["text"],"later version");
}
#[test] fn distinct_devices_keep_their_identity() {
    let mut body=build_jsonl("first", "First", &[frame(12,None)], &[], &[], &[], &[]);body.extend(build_jsonl("second", "Second", &[frame(12,None)], &[], &[], &[], &[]));let parsed=parse_jsonl(&body);assert_eq!(parsed.records.len(),2);assert_eq!(parsed.records[0].device_id(),"first");assert_eq!(parsed.records[1].device_label(),"Second");
}
#[test] fn empty_batch_has_no_records_or_errors() {assert!(wire(&[]).is_empty());let parsed=parse_jsonl(b"\n \t\r\n");assert!(parsed.records.is_empty());assert_eq!(parsed.skipped_lines,0);}
