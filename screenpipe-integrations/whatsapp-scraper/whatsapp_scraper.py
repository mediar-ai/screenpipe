import requests
import json
import time
from datetime import datetime, timezone
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ScreenpipeClient:
    def __init__(self, base_url="http://localhost:3030"):
        self.base_url = base_url

    def open_application(self, app_name):
        logger.info(f"Opening application: {app_name}")
        response = requests.post(
            f"{self.base_url}/experimental/operator/open-application",
            json={"app_name": app_name}
        )
        return response.json()

    def get_text(self, app_name, window_name=None, max_depth=10):
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

def parse_messages_from_elements(elements_data):
    """
    Heuristic-based parsing of WhatsApp messages from accessibility elements.
    WhatsApp structured messages usually have a pattern of:
    - Sender Name (StaticText)
    - Message Body (StaticText)
    - Timestamp (StaticText)
    """
    messages = []
    elements = elements_data.get("elements", [])
    
    current_message = None
    
    for i, el in enumerate(elements):
        text = el.get("text", "").strip()
        role = el.get("role", "").lower()
        
        # Heuristic: WhatsApp message bubbles often contain time stamps like "10:30 AM"
        # and sender names are often followed by the message.
        # This part requires tuning based on the specific platform (MacOS/Windows)
        if not text:
            continue

        # Look for timestamp-like patterns at the end of a message structure
        if ":" in text and (text.endswith("AM") or text.endswith("PM") or len(text) <= 8):
            if current_message:
                current_message["timestamp"] = text
                messages.append(current_message)
                current_message = None
            continue

        if not current_message:
            current_message = {"text": text, "sender": "Unknown", "timestamp": None}
        else:
            # Append text if we already have a starting point, or try to identify sender
            current_message["text"] += f"\n{text}"
    
    return messages

def scrape_whatsapp(client, contact_name):
    # 1. Open WhatsApp
    client.open_application("WhatsApp")
    time.sleep(3) # Wait for it to focus and load

    logger.info(f"Analyzing WhatsApp UI for contact: {contact_name}")
    
    # 2. Extract interactable elements
    elements_data = client.list_interactable_elements("WhatsApp")
    if not elements_data.get("elements"):
        logger.error("Could not find any interactable elements in WhatsApp")
        return

    # 3. Parse elements into structured messages
    messages = parse_messages_from_elements(elements_data)
    
    if not messages:
        # Fallback to general text extraction if granular fails
        logger.warning("Granular parsing yielded no results, falling back to general text")
        text_data = client.get_text("WhatsApp")
        if text_data.get("success"):
            client.add_ui_content(
                device_name="whatsapp-scraper-bot",
                text=text_data.get("text", ""),
                app_name="WhatsApp",
                window_name=f"Chat with {contact_name}"
            )
        return

    # 4. Ingest each parsed message
    logger.info(f"Ingesting {len(messages)} structured messages")
    for msg in messages:
        client.add_ui_content(
            device_name="whatsapp-scraper-bot",
            text=msg["text"],
            timestamp=msg.get("timestamp"),
            app_name="WhatsApp",
            window_name=f"Chat with {contact_name}"
        )

if __name__ == "__main__":
    client = ScreenpipeClient()
    # To run:
    # scrape_whatsapp(client, "Target Contact")
    logger.info("WhatsApp scraper script initialized with granular parsing support.")
