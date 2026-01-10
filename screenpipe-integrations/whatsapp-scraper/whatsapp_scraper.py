"""
WhatsApp Scraper for Screenpipe
Implements the General Purpose Scraper bounty (#1441) by adding a robust mechanism
for ingesting scraped WhatsApp messages into Screenpipe.
"""
import requests
import json
import time
from datetime import datetime, timezone
import logging
import re

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ScreenpipeClient:
    """Client for interacting with Screenpipe's REST API."""

    def __init__(self, base_url="http://localhost:3030"):
        self.base_url = base_url

    def open_application(self, app_name):
        """Open an application using the Screenpipe Operator API."""
        logger.info(f"Opening application: {app_name}")
        response = requests.post(
            f"{self.base_url}/experimental/operator/open-application",
            json={"app_name": app_name}
        )
        return response.json()

    def get_text(self, app_name, window_name=None, max_depth=10):
        """Extract text content from an application window."""
        logger.info(f"Getting text from {app_name}")
        payload = {
            "app_name": app_name,
            "window_name": window_name,
            "max_depth": max_depth
        }
        response = requests.post(
            f"{self.base_url}/experimental/operator/get_text",
            json=payload
        )
        return response.json()

    def list_interactable_elements(self, app_name, window_name=None):
        """List all interactable UI elements in the specified application."""
        logger.info(f"Listing interactable elements for {app_name}")
        payload = {
            "app_name": app_name,
            "window_name": window_name
        }
        response = requests.post(
            f"{self.base_url}/experimental/operator/list-interactable-elements",
            json=payload
        )
        return response.json()

    def click_element(self, app_name, locator):
        """Click on a specific UI element."""
        logger.info(f"Clicking element: {locator}")
        payload = {
            "selector": {
                "app_name": app_name,
                "locator": locator
            }
        }
        response = requests.post(
            f"{self.base_url}/experimental/operator/click",
            json=payload
        )
        return response.json()

    def type_text(self, app_name, locator, text):
        """Type text into a specific UI element."""
        logger.info(f"Typing text: '{text}' into {locator}")
        payload = {
            "selector": {
                "app_name": app_name,
                "locator": locator
            },
            "text": text
        }
        response = requests.post(
            f"{self.base_url}/experimental/operator/type",
            json=payload
        )
        return response.json()

    def add_ui_content(self, device_name, text, app_name, window_name, timestamp=None):
        """
        Add scraped UI content to Screenpipe's database via the /add endpoint.
        This persists structured data into the ui_monitoring table.
        """
        logger.info(f"Adding UI content to database: {app_name} - {window_name}")
        if timestamp is None:
            timestamp = datetime.now(timezone.utc).isoformat()

        payload = {
            "device_name": device_name,
            "content": {
                "content_type": "ui",
                "data": {
                    "text": text,
                    "timestamp": timestamp,
                    "app_name": app_name,
                    "window_name": window_name
                }
            }
        }
        response = requests.post(
            f"{self.base_url}/add",
            json=payload
        )
        return response.json()

    def health_check(self):
        """Check if the Screenpipe server is healthy."""
        try:
            response = requests.get(f"{self.base_url}/health", timeout=5)
            return response.status_code == 200
        except requests.exceptions.RequestException:
            return False


def is_timestamp(text):
    """
    Check if text matches common timestamp patterns.
    Supports formats like:
    - "10:30 AM", "2:45 PM" (12-hour format)
    - "14:30", "09:15" (24-hour format)
    - "Yesterday", "Today" (relative dates)
    """
    if not text:
        return False

    # 12-hour format
    if re.match(r'^\d{1,2}:\d{2}\s*(AM|PM|am|pm)$', text):
        return True

    # 24-hour format
    if re.match(r'^\d{1,2}:\d{2}$', text):
        return True

    # Relative dates
    if text.lower() in ['today', 'yesterday']:
        return True

    return False


def is_sender_name(text):
    """
    Heuristic to detect if text is likely a sender name.
    - Short text (1-3 words typically)
    - Doesn't contain typical message patterns
    - May contain emojis or special chars for WhatsApp names
    """
    if not text or len(text) > 50:
        return False

    words = text.split()
    if len(words) > 4:
        return False

    # Sender names typically don't have certain patterns
    message_patterns = ['http', 'www', '?', '!', '.', ',']
    if any(pattern in text.lower() for pattern in message_patterns):
        return False

    return True


def parse_messages_from_elements(elements_data):
    """
    Heuristic-based parsing of WhatsApp messages from accessibility elements.
    WhatsApp structured messages usually have a pattern of:
    - Sender Name (StaticText)
    - Message Body (StaticText)
    - Timestamp (StaticText)

    Returns a list of message dictionaries with keys: sender, text, timestamp
    """
    messages = []
    elements = elements_data.get("elements", []) or []

    current_message = None

    for i, el in enumerate(elements):
        text = el.get("text", "").strip()
        role = el.get("role", "").lower()

        if not text:
            continue

        # Check if this is a timestamp - signals end of a message
        if is_timestamp(text):
            if current_message:
                current_message["timestamp"] = text
                messages.append(current_message)
                current_message = None
            continue

        # Start a new message or continue building current one
        if not current_message:
            # Try to identify if this is a sender name
            if is_sender_name(text):
                current_message = {"sender": text, "text": "", "timestamp": None}
            else:
                current_message = {"sender": "Unknown", "text": text, "timestamp": None}
        else:
            # Append to existing message text
            if current_message["text"]:
                current_message["text"] += f"\n{text}"
            else:
                current_message["text"] = text

    # Don't forget the last message if it wasn't closed by a timestamp
    if current_message and current_message.get("text"):
        messages.append(current_message)

    return messages


def parse_messages_from_text(raw_text):
    """
    Fallback parser that attempts to extract messages from raw text.
    Uses line-by-line analysis with heuristics.
    """
    messages = []
    lines = raw_text.strip().split('\n')

    current_message = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Check for timestamp patterns
        if is_timestamp(line):
            if current_message:
                current_message["timestamp"] = line
                messages.append(current_message)
                current_message = None
            continue

        # Start new message or append
        if current_message is None:
            current_message = {"sender": "Unknown", "text": line, "timestamp": None}
        else:
            current_message["text"] += f" {line}"

    if current_message:
        messages.append(current_message)

    return messages


def scrape_whatsapp(client, contact_name=None, ingest=True):
    """
    Main function to scrape WhatsApp messages.

    Args:
        client: ScreenpipeClient instance
        contact_name: Optional name of the contact/chat to scrape
        ingest: Whether to ingest messages into Screenpipe database

    Returns:
        List of parsed messages
    """
    # 1. Open WhatsApp
    try:
        client.open_application("WhatsApp")
        time.sleep(3)  # Wait for it to focus and load
    except Exception as e:
        logger.error(f"Failed to open WhatsApp: {e}")
        return []

    logger.info(f"Analyzing WhatsApp UI for contact: {contact_name or 'current chat'}")

    # 2. Extract interactable elements
    try:
        elements_data = client.list_interactable_elements("WhatsApp")
    except Exception as e:
        logger.error(f"Failed to list elements: {e}")
        elements_data = {}

    if not elements_data.get("elements"):
        logger.warning("Could not find any interactable elements in WhatsApp")

        # Fallback to general text extraction
        try:
            text_data = client.get_text("WhatsApp")
            if text_data.get("success") and text_data.get("text"):
                messages = parse_messages_from_text(text_data["text"])

                if ingest:
                    for msg in messages:
                        client.add_ui_content(
                            device_name="whatsapp-scraper-bot",
                            text=msg["text"],
                            app_name="WhatsApp",
                            window_name=f"Chat with {contact_name or 'Unknown'}"
                        )

                return messages
        except Exception as e:
            logger.error(f"Fallback text extraction failed: {e}")

        return []

    # 3. Parse elements into structured messages
    messages = parse_messages_from_elements(elements_data)

    if not messages:
        # Fallback to general text extraction if granular fails
        logger.warning("Granular parsing yielded no results, falling back to general text")
        try:
            text_data = client.get_text("WhatsApp")
            if text_data.get("success"):
                if ingest:
                    client.add_ui_content(
                        device_name="whatsapp-scraper-bot",
                        text=text_data.get("text", ""),
                        app_name="WhatsApp",
                        window_name=f"Chat with {contact_name or 'Unknown'}"
                    )
                return [{"sender": "Unknown", "text": text_data.get("text", ""), "timestamp": None}]
        except Exception as e:
            logger.error(f"Text extraction failed: {e}")
        return []

    # 4. Ingest each parsed message
    if ingest:
        logger.info(f"Ingesting {len(messages)} structured messages")
        for msg in messages:
            client.add_ui_content(
                device_name="whatsapp-scraper-bot",
                text=msg["text"],
                timestamp=msg.get("timestamp"),
                app_name="WhatsApp",
                window_name=f"Chat with {contact_name or 'Unknown'}"
            )

    return messages


if __name__ == "__main__":
    client = ScreenpipeClient()

    # Check if server is running
    if client.health_check():
        logger.info("Screenpipe server is healthy")
        # To run scraping:
        # messages = scrape_whatsapp(client, "Target Contact")
        # print(f"Scraped {len(messages)} messages")
    else:
        logger.warning("Screenpipe server is not available")

    logger.info("WhatsApp scraper script initialized with granular parsing support.")
