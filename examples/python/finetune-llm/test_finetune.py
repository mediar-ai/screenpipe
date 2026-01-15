#!/usr/bin/env python3
"""
Test script for finetune_screenpipe.py
Creates a mock database and verifies export functionality.
"""

import json
import sqlite3
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

# Import functions from main script
from finetune_screenpipe import (
    export_ocr_data,
    export_audio_data,
    export_ui_data,
    format_for_instruction_tuning,
    format_for_completion,
    save_training_data,
)


def create_mock_database(db_path: Path) -> None:
    """Create a mock screenpipe database with test data."""
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # Create frames table
    cursor.execute("""
        CREATE TABLE frames (
            id INTEGER PRIMARY KEY,
            timestamp TEXT NOT NULL,
            browser_url TEXT,
            app_name TEXT,
            window_name TEXT
        )
    """)

    # Create ocr_text table (matches real screenpipe schema)
    cursor.execute("""
        CREATE TABLE ocr_text (
            frame_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            text_json TEXT,
            app_name TEXT NOT NULL DEFAULT '',
            ocr_engine TEXT NOT NULL DEFAULT 'unknown',
            window_name TEXT,
            focused BOOLEAN DEFAULT FALSE,
            FOREIGN KEY (frame_id) REFERENCES frames(id)
        )
    """)

    # Create speakers table
    cursor.execute("""
        CREATE TABLE speakers (
            id INTEGER PRIMARY KEY,
            name TEXT
        )
    """)

    # Create audio_transcriptions table
    cursor.execute("""
        CREATE TABLE audio_transcriptions (
            id INTEGER PRIMARY KEY,
            timestamp TEXT NOT NULL,
            transcription TEXT,
            device TEXT,
            is_input_device INTEGER,
            speaker_id INTEGER,
            FOREIGN KEY (speaker_id) REFERENCES speakers(id)
        )
    """)

    # Create ui_monitoring table
    cursor.execute("""
        CREATE TABLE ui_monitoring (
            id INTEGER PRIMARY KEY,
            timestamp TEXT NOT NULL,
            text_output TEXT,
            app_name TEXT,
            window_name TEXT,
            browser_url TEXT
        )
    """)

    # Insert test data
    now = datetime.now()
    yesterday = now - timedelta(days=1)

    # Insert frames with OCR data
    cursor.execute("""
        INSERT INTO frames (id, timestamp, browser_url, app_name, window_name)
        VALUES (1, ?, 'https://github.com/mediar-ai/screenpipe', 'Chrome', 'screenpipe GitHub')
    """, (yesterday.isoformat(),))

    cursor.execute("""
        INSERT INTO ocr_text (frame_id, text, app_name, window_name)
        VALUES (1, 'This is a test OCR text from a GitHub page about screenpipe. It contains enough text to pass the length filter and be included in the training data export.', 'Chrome', 'screenpipe GitHub')
    """)

    cursor.execute("""
        INSERT INTO frames (id, timestamp, browser_url, app_name, window_name)
        VALUES (2, ?, NULL, 'VS Code', 'finetune_screenpipe.py - screenpipe')
    """, (now.isoformat(),))

    cursor.execute("""
        INSERT INTO ocr_text (frame_id, text, app_name, window_name)
        VALUES (2, 'def export_ocr_data(conn, days=30, limit=10000): Export OCR screen capture data from screenpipe database for fine-tuning language models.', 'VS Code', 'finetune_screenpipe.py - screenpipe')
    """)

    # Insert speaker
    cursor.execute("INSERT INTO speakers (id, name) VALUES (1, 'John Doe')")

    # Insert audio transcriptions
    cursor.execute("""
        INSERT INTO audio_transcriptions (timestamp, transcription, device, is_input_device, speaker_id)
        VALUES (?, 'Hey, have you seen the new screenpipe fine-tuning feature? It allows you to train your own AI on your captured data.', 'MacBook Pro Microphone', 1, 1)
    """, (yesterday.isoformat(),))

    cursor.execute("""
        INSERT INTO audio_transcriptions (timestamp, transcription, device, is_input_device, speaker_id)
        VALUES (?, 'Yes, I think it is a great addition. Personal AI assistants trained on your own data could be very useful.', 'MacBook Pro Speakers', 0, NULL)
    """, (now.isoformat(),))

    # Insert UI monitoring data
    cursor.execute("""
        INSERT INTO ui_monitoring (timestamp, text_output, app_name, window_name, browser_url)
        VALUES (?, 'File menu opened. Options: New, Open, Save, Save As, Export, Close', 'VS Code', 'finetune_screenpipe.py', NULL)
    """, (yesterday.isoformat(),))

    conn.commit()
    conn.close()


def test_export_functions():
    """Test all export functions with mock database."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "db.sqlite3"
        output_path = Path(tmpdir) / "training.jsonl"

        print("creating mock database...")
        create_mock_database(db_path)

        print("connecting to database...")
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row

        # Test OCR export
        print("\n--- testing ocr export ---")
        ocr_data = export_ocr_data(conn, days=30, limit=100)
        print(f"exported {len(ocr_data)} ocr entries")
        assert len(ocr_data) == 2, f"expected 2 ocr entries, got {len(ocr_data)}"
        print(f"  sample: {ocr_data[0]['app_name']} - {ocr_data[0]['text'][:50]}...")

        # Test Audio export
        print("\n--- testing audio export ---")
        audio_data = export_audio_data(conn, days=30, limit=100)
        print(f"exported {len(audio_data)} audio entries")
        assert len(audio_data) == 2, f"expected 2 audio entries, got {len(audio_data)}"
        print(f"  sample: {audio_data[0]['speaker'] or 'unknown'} - {audio_data[0]['transcription'][:50]}...")

        # Test UI export
        print("\n--- testing ui export ---")
        ui_data = export_ui_data(conn, days=30, limit=100)
        print(f"exported {len(ui_data)} ui entries")
        assert len(ui_data) == 1, f"expected 1 ui entry, got {len(ui_data)}"
        print(f"  sample: {ui_data[0]['app_name']} - {ui_data[0]['text'][:50]}...")

        conn.close()

        # Test formatting (include all data types)
        all_data = ocr_data + audio_data + ui_data

        print("\n--- testing instruction format ---")
        instruction_data = format_for_instruction_tuning(all_data)
        print(f"formatted {len(instruction_data)} instruction examples")
        assert len(instruction_data) == 5, f"expected 5 examples, got {len(instruction_data)}"
        assert "messages" in instruction_data[0]
        print(f"  sample messages: {len(instruction_data[0]['messages'])} messages")

        print("\n--- testing completion format ---")
        completion_data = format_for_completion(all_data)
        print(f"formatted {len(completion_data)} completion examples")
        assert len(completion_data) == 5, f"expected 5 examples, got {len(completion_data)}"
        assert "prompt" in completion_data[0]
        assert "completion" in completion_data[0]
        print(f"  sample prompt: {completion_data[0]['prompt']}")

        # Test save
        print("\n--- testing save function ---")
        save_training_data(instruction_data, output_path)
        assert output_path.exists(), "output file not created"

        with open(output_path) as f:
            lines = f.readlines()
        assert len(lines) == 5, f"expected 5 lines, got {len(lines)}"

        # Verify JSON format
        for i, line in enumerate(lines):
            try:
                json.loads(line)
            except json.JSONDecodeError as e:
                raise AssertionError(f"line {i+1} is not valid json: {e}")

        print(f"  saved to {output_path} ({len(lines)} lines)")

        print("\n" + "=" * 50)
        print("all tests passed!")
        print("=" * 50)


if __name__ == "__main__":
    test_export_functions()
