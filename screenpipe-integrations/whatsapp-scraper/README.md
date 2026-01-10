# WhatsApp Scraper for Screenpipe

This module implements WhatsApp message scraping and ingestion for Screenpipe, fulfilling bounty #1441.

## Overview

The WhatsApp scraper uses Screenpipe's Operator API for UI automation to:
1. Open the WhatsApp application
2. Extract message elements from the accessibility tree
3. Parse messages using heuristic-based algorithms
4. Ingest parsed messages into Screenpipe's database via the `/add` endpoint

## Installation

```bash
cd screenpipe-integrations/whatsapp-scraper
pip install -r requirements.txt
```

## Usage

```python
from whatsapp_scraper import ScreenpipeClient, scrape_whatsapp

# Initialize client
client = ScreenpipeClient(base_url="http://localhost:3030")

# Check if server is running
if client.health_check():
    # Scrape messages from current WhatsApp chat
    messages = scrape_whatsapp(client, contact_name="John Doe")
    print(f"Scraped {len(messages)} messages")
```

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `/experimental/operator/open-application` | Open WhatsApp |
| `/experimental/operator/get_text` | Extract text content |
| `/experimental/operator/list-interactable-elements` | Get UI elements |
| `/add` | Ingest UI content to database |

## Running Tests

```bash
# Run all scraper tests
python -m unittest test_scraper -v

# Run API integration tests
python -m unittest tests.test_api_integration -v

# Run all tests
python -m unittest discover -v
```

## Test Coverage

| Test Suite | Tests | Description |
|------------|-------|-------------|
| `test_scraper.py` | 37 | Core scraper functionality |
| `tests/test_api_integration.py` | 14 | API payload/integration tests |

## Message Parsing Heuristics

The scraper uses heuristics to parse WhatsApp messages:

1. **Timestamp Detection**: Identifies patterns like "10:30 AM", "14:30", "Today"
2. **Sender Detection**: Short names (1-4 words) without URL/punctuation patterns
3. **Message Grouping**: Groups consecutive text elements until timestamp is found

### Supported Formats

- 12-hour time: `10:30 AM`, `2:45 PM`
- 24-hour time: `14:30`, `09:15`
- Relative dates: `Today`, `Yesterday`

## Architecture

```
whatsapp_scraper.py
├── ScreenpipeClient          # API client for Screenpipe
│   ├── open_application()    # Open app via Operator API
│   ├── get_text()            # Extract text content
│   ├── list_interactable_elements()  # Get UI elements
│   ├── add_ui_content()      # Ingest to database
│   └── health_check()        # Server health check
├── parse_messages_from_elements()   # Parse accessibility elements
├── parse_messages_from_text()       # Fallback text parser
└── scrape_whatsapp()                # Main scraping function
```

## Database Integration

Scraped content is stored in the `ui_monitoring` table:

| Column | Description |
|--------|-------------|
| `text_output` | Scraped message text |
| `timestamp` | Message timestamp |
| `app` | Application name ("WhatsApp") |
| `window` | Window/chat name |

FTS (Full-Text Search) triggers are leveraged for immediate searchability.

## Error Handling

- Application open failures are logged and return empty results
- Element extraction failures trigger fallback to text extraction
- Network errors are caught and logged appropriately

## Contributing

See the main Screenpipe [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.
