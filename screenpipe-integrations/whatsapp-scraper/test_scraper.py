import unittest
from unittest.mock import patch, MagicMock
from whatsapp_scraper import ScreenpipeClient, parse_messages_from_elements

class TestWhatsAppScraper(unittest.TestCase):
    def setUp(self):
        self.client = ScreenpipeClient(base_url="http://mock-server")

    def test_parse_messages_heuristic(self):
        # Mock accessibility elements structure
        mock_elements = {
            "elements": [
                {"text": "John Doe", "role": "StaticText"},
                {"text": "Hello, how are you?", "role": "StaticText"},
                {"text": "10:30 AM", "role": "StaticText"},
                {"text": "Jane Smith", "role": "StaticText"},
                {"text": "I'm good, thanks!", "role": "StaticText"},
                {"text": "10:35 AM", "role": "StaticText"}
            ]
        }
        
        messages = parse_messages_from_elements(mock_elements)
        
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0]["timestamp"], "10:30 AM")
        self.assertIn("Hello", messages[0]["text"])
        self.assertEqual(messages[1]["timestamp"], "10:35 AM")

    @patch('requests.post')
    def test_add_ui_content_api(self, mock_post):
        mock_post.return_value.json.return_value = {"success": True}
        
        response = self.client.add_ui_content(
            device_name="test-device",
            text="test message",
            app_name="WhatsApp",
            window_name="Test Window"
        )
        
        self.assertTrue(response["success"])
        # Verify the payload structure matches our new /add endpoint
        args, kwargs = mock_post.call_args
        payload = kwargs['json']
        self.assertEqual(payload['content']['content_type'], 'frames')
        self.assertEqual(payload['content']['data'][0]['ocr_results'][0]['text'], 'test message')

if __name__ == '__main__':
    unittest.main()
