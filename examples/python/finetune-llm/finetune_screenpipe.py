#!/usr/bin/env python3
"""
Screenpipe LLM Fine-tuning Script

Fine-tune local LLMs (Llama, Mistral) or OpenAI models on your screenpipe data.
Your personal AI assistant trained on YOUR digital activity.

Usage:
    # Export data and fine-tune locally with Llama
    python finetune_screenpipe.py --mode local --model unsloth/Llama-3.2-1B-Instruct

    # Export data and fine-tune with OpenAI
    python finetune_screenpipe.py --mode openai --model gpt-4o-mini-2024-07-18

    # Just export data without training
    python finetune_screenpipe.py --export-only --output training_data.jsonl
"""

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Default screenpipe data directory
DEFAULT_SCREENPIPE_DIR = Path.home() / ".screenpipe"
DEFAULT_DB_PATH = DEFAULT_SCREENPIPE_DIR / "db.sqlite"


def get_db_connection(db_path: Path) -> sqlite3.Connection:
    """Connect to the screenpipe SQLite database."""
    if not db_path.exists():
        # Try alternative paths
        alt_paths = [
            DEFAULT_SCREENPIPE_DIR / "db.sqlite",
            DEFAULT_SCREENPIPE_DIR / "screenpipe.db",
        ]
        for alt in alt_paths:
            if alt.exists():
                db_path = alt
                break
        else:
            raise FileNotFoundError(
                f"Screenpipe database not found. Tried: {db_path}, {alt_paths}\n"
                f"Make sure screenpipe is running and has captured some data."
            )

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def export_ocr_data(conn: sqlite3.Connection, days: int = 30, limit: int = 10000) -> list[dict]:
    """Export OCR (screen capture) data from screenpipe."""
    cutoff_date = datetime.now() - timedelta(days=days)

    query = """
    SELECT
        f.timestamp,
        ot.app_name,
        ot.window_name,
        ot.text as ocr_text
    FROM frames f
    JOIN ocr_text ot ON f.id = ot.frame_id
    WHERE f.timestamp > ?
    AND ot.text IS NOT NULL
    AND length(ot.text) > 50
    ORDER BY f.timestamp DESC
    LIMIT ?
    """

    cursor = conn.execute(query, (cutoff_date.isoformat(), limit))
    results = []

    for row in cursor:
        results.append({
            "timestamp": row["timestamp"],
            "app_name": row["app_name"] or "Unknown",
            "window_name": row["window_name"] or "",
            "text": row["ocr_text"],
            "source": "screen"
        })

    return results


def export_audio_data(conn: sqlite3.Connection, days: int = 30, limit: int = 10000) -> list[dict]:
    """Export audio transcription data from screenpipe."""
    cutoff_date = datetime.now() - timedelta(days=days)

    query = """
    SELECT
        at.timestamp,
        at.transcription,
        at.device as device_name,
        at.is_input_device
    FROM audio_transcriptions at
    WHERE at.timestamp > ?
    AND at.transcription IS NOT NULL
    AND length(at.transcription) > 20
    ORDER BY at.timestamp DESC
    LIMIT ?
    """

    cursor = conn.execute(query, (cutoff_date.isoformat(), limit))
    results = []

    for row in cursor:
        results.append({
            "timestamp": row["timestamp"],
            "transcription": row["transcription"],
            "device_name": row["device_name"] or "Unknown",
            "is_input": bool(row["is_input_device"]),
            "speaker": None,
            "source": "audio"
        })

    return results


def export_ui_data(conn: sqlite3.Connection, days: int = 30, limit: int = 5000) -> list[dict]:
    """Export UI monitoring data from screenpipe."""
    cutoff_date = datetime.now() - timedelta(days=days)

    query = """
    SELECT
        timestamp,
        text_output as text,
        app_name,
        window_name,
        browser_url
    FROM ui_monitoring
    WHERE timestamp > ?
    AND text_output IS NOT NULL
    AND length(text_output) > 30
    ORDER BY timestamp DESC
    LIMIT ?
    """

    try:
        cursor = conn.execute(query, (cutoff_date.isoformat(), limit))
        results = []

        for row in cursor:
            results.append({
                "timestamp": row["timestamp"],
                "text": row["text"],
                "app_name": row["app_name"],
                "window_name": row["window_name"],
                "browser_url": row["browser_url"],
                "source": "ui"
            })

        return results
    except sqlite3.OperationalError:
        # UI monitoring table might not exist in older versions
        return []


def format_for_instruction_tuning(data: list[dict]) -> list[dict]:
    """
    Format data as instruction-following examples.
    Creates Q&A pairs based on screen/audio context.
    """
    formatted = []

    for item in data:
        if item["source"] == "screen":
            # Create contextual Q&A from screen content
            context = f"App: {item.get('app_name', 'Unknown')}"
            if item.get("window_name"):
                context += f" | Window: {item['window_name']}"
            if item.get("browser_url"):
                context += f" | URL: {item['browser_url']}"

            text = item.get("text", "")[:2000]  # Limit text length

            formatted.append({
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a helpful assistant with knowledge about the user's digital activities."
                    },
                    {
                        "role": "user",
                        "content": f"What was I looking at in {item.get('app_name', 'this app')}?"
                    },
                    {
                        "role": "assistant",
                        "content": f"Based on your screen capture ({context}), you were viewing:\n\n{text}"
                    }
                ]
            })

        elif item["source"] == "audio":
            speaker = item.get("speaker") or ("You" if item.get("is_input") else "Someone")
            transcription = item.get("transcription", "")[:1500]

            formatted.append({
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a helpful assistant that remembers conversations."
                    },
                    {
                        "role": "user",
                        "content": "What did I say or hear recently?"
                    },
                    {
                        "role": "assistant",
                        "content": f"{speaker} said: \"{transcription}\""
                    }
                ]
            })

        elif item["source"] == "ui":
            context = f"App: {item.get('app_name', 'Unknown')}"
            if item.get("window_name"):
                context += f" | Window: {item['window_name']}"
            text = item.get("text", "")[:2000]

            formatted.append({
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a helpful assistant with knowledge about the user's UI interactions."
                    },
                    {
                        "role": "user",
                        "content": f"What UI elements were visible in {item.get('app_name', 'this app')}?"
                    },
                    {
                        "role": "assistant",
                        "content": f"Based on UI monitoring ({context}), I saw:\n\n{text}"
                    }
                ]
            })

    return formatted


def format_for_completion(data: list[dict]) -> list[dict]:
    """
    Format data as completion examples (simpler format).
    Good for base model fine-tuning.
    """
    formatted = []

    for item in data:
        if item["source"] == "screen":
            text = item.get("text", "")[:2000]
            app = item.get("app_name", "Unknown")
            formatted.append({
                "prompt": f"Screen content from {app}:",
                "completion": f" {text}"
            })

        elif item["source"] == "audio":
            transcription = item.get("transcription", "")[:1500]
            formatted.append({
                "prompt": "Audio transcription:",
                "completion": f" {transcription}"
            })

        elif item["source"] == "ui":
            text = item.get("text", "")[:2000]
            app = item.get("app_name", "Unknown")
            formatted.append({
                "prompt": f"UI content from {app}:",
                "completion": f" {text}"
            })

    return formatted


def save_training_data(data: list[dict], output_path: Path):
    """Save formatted training data to file."""
    with open(output_path, "w", encoding="utf-8") as f:
        for item in data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    print(f"saved {len(data)} training examples to {output_path}")


def finetune_local(
    training_file: Path,
    model_name: str = "unsloth/Llama-3.2-1B-Instruct",
    output_dir: str = "./screenpipe-model",
    max_steps: int = 100,
):
    """Fine-tune a local model using unsloth (fast LoRA training)."""
    try:
        from unsloth import FastLanguageModel
        from trl import SFTTrainer
        from transformers import TrainingArguments
        from datasets import load_dataset
    except ImportError:
        print("required packages not installed. install with:")
        print("  pip install unsloth transformers trl datasets")
        sys.exit(1)

    print(f"loading model: {model_name}")

    # Load model with 4-bit quantization for efficiency
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=model_name,
        max_seq_length=2048,
        dtype=None,  # Auto-detect
        load_in_4bit=True,
    )

    # Add LoRA adapters
    model = FastLanguageModel.get_peft_model(
        model,
        r=16,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
        lora_alpha=16,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=42,
    )

    # Load training data
    dataset = load_dataset("json", data_files=str(training_file), split="train")

    # Format for chat template
    def formatting_func(examples):
        texts = []
        for messages in examples["messages"]:
            text = tokenizer.apply_chat_template(messages, tokenize=False)
            texts.append(text)
        return {"text": texts}

    dataset = dataset.map(formatting_func, batched=True)

    # Training arguments
    training_args = TrainingArguments(
        output_dir=output_dir,
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        warmup_steps=5,
        max_steps=max_steps,
        learning_rate=2e-4,
        fp16=True,
        logging_steps=10,
        save_steps=50,
        save_total_limit=2,
    )

    # Train
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=2048,
        args=training_args,
    )

    print("starting training...")
    trainer.train()

    # Save the model
    model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)

    print(f"\nmodel saved to {output_dir}")
    print("\nto use with ollama:")
    print(f"  1. convert to gguf format")
    print(f"  2. create modelfile and run: ollama create screenpipe-model -f Modelfile")


def finetune_openai(
    training_file: Path,
    model_name: str = "gpt-4o-mini-2024-07-18",
    suffix: str = "screenpipe",
):
    """Fine-tune an OpenAI model."""
    try:
        from openai import OpenAI
    except ImportError:
        print("openai package not installed. install with:")
        print("  pip install openai")
        sys.exit(1)

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("error: OPENAI_API_KEY environment variable not set")
        sys.exit(1)

    client = OpenAI(api_key=api_key)

    # Upload training file
    print(f"uploading training file: {training_file}")
    with open(training_file, "rb") as f:
        file_response = client.files.create(file=f, purpose="fine-tune")

    print(f"file uploaded: {file_response.id}")

    # Create fine-tuning job
    print(f"creating fine-tuning job for model: {model_name}")
    job = client.fine_tuning.jobs.create(
        training_file=file_response.id,
        model=model_name,
        suffix=suffix,
    )

    print(f"\nfine-tuning job created!")
    print(f"  job id: {job.id}")
    print(f"  status: {job.status}")
    print(f"\nmonitor progress with:")
    print(f"  openai api fine_tuning.jobs.retrieve -i {job.id}")
    print(f"\nonce complete, use your model with:")
    print(f"  model_name = '{model_name}:{suffix}'")


def main():
    parser = argparse.ArgumentParser(
        description="Fine-tune LLMs on your screenpipe data",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Export data only
  python finetune_screenpipe.py --export-only --output my_data.jsonl

  # Fine-tune locally with Llama
  python finetune_screenpipe.py --mode local --model unsloth/Llama-3.2-1B-Instruct

  # Fine-tune with OpenAI (requires OPENAI_API_KEY)
  python finetune_screenpipe.py --mode openai --model gpt-4o-mini-2024-07-18
        """
    )

    parser.add_argument(
        "--mode",
        choices=["local", "openai", "export"],
        default="export",
        help="Fine-tuning mode: local (unsloth), openai, or export only"
    )
    parser.add_argument(
        "--model",
        default="unsloth/Llama-3.2-1B-Instruct",
        help="Model to fine-tune (default: unsloth/Llama-3.2-1B-Instruct)"
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=DEFAULT_DB_PATH,
        help=f"Path to screenpipe database (default: {DEFAULT_DB_PATH})"
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("screenpipe_training.jsonl"),
        help="Output path for training data"
    )
    parser.add_argument(
        "--output-dir",
        default="./screenpipe-model",
        help="Output directory for fine-tuned model"
    )
    parser.add_argument(
        "--days",
        type=int,
        default=30,
        help="Number of days of data to export (default: 30)"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=5000,
        help="Maximum number of examples per source (default: 5000)"
    )
    parser.add_argument(
        "--max-steps",
        type=int,
        default=100,
        help="Maximum training steps for local training (default: 100)"
    )
    parser.add_argument(
        "--format",
        choices=["instruction", "completion"],
        default="instruction",
        help="Training data format (default: instruction)"
    )
    parser.add_argument(
        "--export-only",
        action="store_true",
        help="Only export data, don't train"
    )

    args = parser.parse_args()

    # Connect to database
    print(f"connecting to screenpipe database: {args.db_path}")
    try:
        conn = get_db_connection(args.db_path)
    except FileNotFoundError as e:
        print(f"error: {e}")
        sys.exit(1)

    # Export data
    print(f"\nexporting data from last {args.days} days...")

    ocr_data = export_ocr_data(conn, days=args.days, limit=args.limit)
    print(f"  ocr (screen) data: {len(ocr_data)} entries")

    audio_data = export_audio_data(conn, days=args.days, limit=args.limit)
    print(f"  audio data: {len(audio_data)} entries")

    ui_data = export_ui_data(conn, days=args.days, limit=args.limit)
    print(f"  ui data: {len(ui_data)} entries")

    conn.close()

    # Combine all data
    all_data = ocr_data + audio_data + ui_data

    if not all_data:
        print("\nno data found! make sure screenpipe has been running and capturing data.")
        sys.exit(1)

    print(f"\ntotal: {len(all_data)} entries")

    # Format data
    print(f"\nformatting data for {args.format} tuning...")
    if args.format == "instruction":
        formatted_data = format_for_instruction_tuning(all_data)
    else:
        formatted_data = format_for_completion(all_data)

    # Save training data
    save_training_data(formatted_data, args.output)

    # Train if requested
    if args.export_only or args.mode == "export":
        print("\ndata export complete. use --mode local or --mode openai to fine-tune.")
        return

    if args.mode == "local":
        finetune_local(
            args.output,
            model_name=args.model,
            output_dir=args.output_dir,
            max_steps=args.max_steps,
        )
    elif args.mode == "openai":
        finetune_openai(
            args.output,
            model_name=args.model,
        )


if __name__ == "__main__":
    main()
