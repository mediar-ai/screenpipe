import requests
import json
import time
import os
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

    def add_ui_content(self, *, device_name, text, app_name, window_name, timestamp=None):
        logger.info(f"Adding UI content to database (WORKAROUND: using frames): {app_name} - {window_name}")
        
        if timestamp is None:
            timestamp = datetime.now(timezone.utc).isoformat()
        
        # Ensure timestamp is in Z format
        if timestamp.endswith("+00:00"):
            timestamp = timestamp.replace("+00:00", "Z")

        # Workaround: Use dynamic path for mock image to allow running on any machine
        mock_image_path = os.path.join(os.getcwd(), "mock.png")
        if not os.path.exists(mock_image_path):
            # Create a 1x1 png if it doesn't exist to prevent IO errors
            with open(mock_image_path, 'wb') as f:
                 f.write(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82')

        payload = {
            "device_name": device_name,
            "content": {
                "content_type": "frames",
                "data": [{
                    "file_path": mock_image_path,
                    "timestamp": timestamp,
                    "app_name": app_name,
                    "window_name": window_name,
                    "ocr_results": [{
                        "text": text, 
                        "focused": True
                    }],
                    "tags": ["whatsapp"]
                }]
            }
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/add",
                json=payload
            )
            response.raise_for_status()
            try:
                return response.json()
            except Exception:
                 # Handle empty/non-JSON 200 responses
                 return {"success": True, "message": "Content added (no JSON)"}
        except Exception as e:
            logger.error(f"Failed to add content: {e}")
            return {"success": False, "error": str(e)}

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
    # 3. Real Scraping Strategy: Query Screenpipe for what it just saw (OCR)
    logger.info("Querying Screenpipe OCR for recent WhatsApp text...")
    # Give Screenpipe a moment to index the frame
    time.sleep(4) 
    
    messages = []
    try:
        # Search for recent text in WhatsApp
        now = datetime.now(timezone.utc)
        search_url = f"{client.base_url}/search?q=&app_name=WhatsApp&limit=10&content_type=ocr"
        r = requests.get(search_url)
        r.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
        results = r.json()
        
        found_data = []
        if results.get("data"):
            for item in results["data"]:
                content = item.get("content", {})
                # Handle nested OCR results if present, or direct text
                text_content = content.get("text")
                if not text_content and content.get("ocr_results"):
                     # Attempt to join text from OCR blocks if struct is different
                     text_content = " ".join([b.get("text","") for b in content["ocr_results"]])
                
                if text_content:
                    found_data.append({"text": text_content, "timestamp": content.get("timestamp", "Just now")})
        
        if found_data:
             logger.info(f"Found {len(found_data)} real messages via OCR.")
             messages = found_data
        else:
             logger.warning("No OCR data matched.")
    except Exception as e:
        logger.error(f"Search failed: {e}")

    # Fallback / Demo Mode removed per user request for production purity.
    if not messages:
        logger.warning("No real data found via OCR. Scraper will exit without ingestion.")
        return
    
    for m in messages:
        print(f"  - [{m['timestamp']}] {m['text'][:50]}...")

    # 4. Ingest each parsed message
    logger.info(f"Ingesting {len(messages)} messages into Screenpipe...")
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
