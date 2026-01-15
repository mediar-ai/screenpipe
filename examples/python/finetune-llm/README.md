# Screenpipe LLM Fine-tuning

Fine-tune local LLMs (Llama, Mistral) or OpenAI models on your screenpipe data. Create a personal AI assistant trained on YOUR digital activity.

## Quick Start

### Export Data Only

```bash
# Export your screenpipe data to a training file
python finetune_screenpipe.py --export-only --output my_data.jsonl
```

### Fine-tune Locally with Llama

```bash
# Install dependencies
pip install -r requirements-local.txt

# Fine-tune Llama 3.2 1B on your data
python finetune_screenpipe.py --mode local --model unsloth/Llama-3.2-1B-Instruct
```

### Fine-tune with OpenAI

```bash
# Install dependencies
pip install -r requirements-openai.txt

# Set your API key
export OPENAI_API_KEY="your-key-here"

# Fine-tune GPT-4o-mini
python finetune_screenpipe.py --mode openai --model gpt-4o-mini-2024-07-18
```

## Prerequisites

- Python 3.10+
- Screenpipe running with captured data (`~/.screenpipe/db.sqlite`)
- For local training: NVIDIA GPU with 8GB+ VRAM (recommended)
- For OpenAI: API key with fine-tuning access

## Command Line Options

| Option | Default | Description |
|--------|---------|-------------|
| `--mode` | `export` | `local`, `openai`, or `export` |
| `--model` | `unsloth/Llama-3.2-1B-Instruct` | Model to fine-tune |
| `--db-path` | `~/.screenpipe/db.sqlite` | Path to screenpipe database |
| `--output` | `screenpipe_training.jsonl` | Output training data file |
| `--output-dir` | `./screenpipe-model` | Output directory for local model |
| `--days` | `30` | Days of data to export |
| `--limit` | `5000` | Max examples per source |
| `--max-steps` | `100` | Training steps (local only) |
| `--format` | `instruction` | `instruction` or `completion` |
| `--export-only` | `false` | Only export, don't train |

## Using Your Fine-tuned Model

### With Ollama (Local Model)

After local fine-tuning, convert and use with Ollama:

```bash
# 1. Convert to GGUF format (requires llama.cpp)
python -m unsloth.save_to_gguf ./screenpipe-model screenpipe-model.gguf

# 2. Create Modelfile
cat > Modelfile << 'EOF'
FROM ./screenpipe-model.gguf
TEMPLATE """{{ if .System }}<|start_header_id|>system<|end_header_id|>
{{ .System }}<|eot_id|>{{ end }}{{ if .Prompt }}<|start_header_id|>user<|end_header_id|>
{{ .Prompt }}<|eot_id|>{{ end }}<|start_header_id|>assistant<|end_header_id|>
{{ .Response }}<|eot_id|>"""
PARAMETER stop "<|eot_id|>"
EOF

# 3. Create Ollama model
ollama create screenpipe-assistant -f Modelfile

# 4. Test it
ollama run screenpipe-assistant "What was I working on yesterday?"
```

### In Screenpipe Settings

1. Go to Screenpipe Settings → AI
2. For Ollama: Set model to `screenpipe-assistant`
3. For OpenAI: Use your fine-tuned model name (e.g., `ft:gpt-4o-mini-2024-07-18:your-org::abc123`)

### In Custom Pipes

```typescript
// In your pipe code
const response = await pipe.llm({
  model: "screenpipe-assistant", // or your OpenAI fine-tuned model
  messages: [
    { role: "user", content: "What meetings did I have this week?" }
  ]
});
```

## Data Sources

The script exports three types of screenpipe data:

| Source | Description | Training Use |
|--------|-------------|--------------|
| **OCR** | Screen captures with text | Context about apps/websites used |
| **Audio** | Transcribed conversations | Meeting summaries, spoken context |
| **UI** | UI element monitoring | Detailed interaction patterns |

## Training Data Formats

### Instruction Format (default)

Creates Q&A pairs for chat-style models:

```json
{
  "messages": [
    {"role": "system", "content": "You are a helpful assistant..."},
    {"role": "user", "content": "What was I looking at in Chrome?"},
    {"role": "assistant", "content": "Based on your screen capture..."}
  ]
}
```

### Completion Format

Simple prompt/completion pairs for base models:

```json
{
  "prompt": "Screen content from Chrome:",
  "completion": " [extracted text content]"
}
```

## Tips for Better Results

1. **More data = better model**: Run screenpipe for at least a week before training
2. **Increase training steps**: Use `--max-steps 500` for better quality
3. **Filter by app**: Modify the SQL queries to focus on specific apps
4. **Use recent data**: `--days 7` for most relevant context
5. **GPU matters**: Local training is 10-50x faster on GPU vs CPU

## Troubleshooting

### "Database not found"

Make sure screenpipe is running and has captured data:
```bash
ls -la ~/.screenpipe/db.sqlite
```

### "CUDA out of memory"

Reduce batch size or use a smaller model:
```bash
python finetune_screenpipe.py --mode local --model unsloth/Llama-3.2-1B-Instruct
```

### OpenAI rate limits

Wait and retry, or use `--limit 1000` to reduce training data size.

## Privacy Note

Your screenpipe data contains sensitive information about your digital activity. The training data and fine-tuned models should be treated as private. When using OpenAI, your data is sent to their servers for training.

## License

MIT - Same as screenpipe
