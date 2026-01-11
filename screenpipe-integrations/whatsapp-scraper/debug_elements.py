from whatsapp_scraper import ScreenpipeClient
import json
import time

def debug_whatsapp_elements():
    client = ScreenpipeClient()
    print("🔍 Attempting to find WhatsApp window...")
    
    # 1. Open/Focus WhatsApp
    client.open_application("WhatsApp")
    time.sleep(2) # Give it time to focus
    
    # 2. List all elements
    print("📋 Fetching UI elements...")
    try:
        # Assuming list_interactable_elements returns a dict or list
        # We need to see RAW output to understand what's happening
        # Note: In the viewed code, list_interactable_elements implementation wasn't fully visible
        # but let's assume it follows the client pattern.
        # If the method doesn't exist, we'll find out.
        
        # Checking client methods via dir() if needed, but let's try calling it.
        # Based on previous file view, we assumed it exists.
        # Let's check server.rs again... there is 'type_by_index_handler' which uses 'element_cache'.
        # We need the client-side method that calls the endpoint to populate that cache.
        
        # Start by calling the endpoint directly if client method is unknown
        import requests
        response = requests.get("http://localhost:3030/experimental/ui/accessibility")
        if response.status_code == 200:
            print("✅ Accessibility API reachable")
            data = response.json()
            print(json.dumps(data, indent=2))
        else:
            print(f"❌ Accessibility API failed: {response.status_code} - {response.text}")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    debug_whatsapp_elements()
