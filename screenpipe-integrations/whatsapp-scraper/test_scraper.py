"""
Comprehensive Test Suite for WhatsApp Scraper Integration
Tests for PR #2026 - WhatsApp Scraper Integration for Bounty #1441

This test suite covers:
1. Message parsing heuristics
2. Timestamp detection
3. Sender name detection
4. API client functionality
5. Edge cases and error handling
"""
import unittest
from unittest.mock import patch, MagicMock, Mock
import json
from datetime import datetime, timezone

from whatsapp_scraper import (
    ScreenpipeClient,
    parse_messages_from_elements,
    parse_messages_from_text,
    is_timestamp,
    is_sender_name,
    scrape_whatsapp
)


class TestTimestampDetection(unittest.TestCase):
    """Test cases for timestamp pattern detection."""

    def test_12_hour_format_am(self):
        """Test 12-hour AM format detection."""
        self.assertTrue(is_timestamp("10:30 AM"))
        self.assertTrue(is_timestamp("9:45 am"))
        self.assertTrue(is_timestamp("12:00 AM"))

    def test_12_hour_format_pm(self):
        """Test 12-hour PM format detection."""
        self.assertTrue(is_timestamp("2:30 PM"))
        self.assertTrue(is_timestamp("11:59 pm"))
        self.assertTrue(is_timestamp("12:00 PM"))

    def test_24_hour_format(self):
        """Test 24-hour format detection."""
        self.assertTrue(is_timestamp("14:30"))
        self.assertTrue(is_timestamp("09:15"))
        self.assertTrue(is_timestamp("23:59"))
        self.assertTrue(is_timestamp("0:00"))

    def test_relative_dates(self):
        """Test relative date detection."""
        self.assertTrue(is_timestamp("Today"))
        self.assertTrue(is_timestamp("today"))
        self.assertTrue(is_timestamp("Yesterday"))
        self.assertTrue(is_timestamp("YESTERDAY"))

    def test_non_timestamps(self):
        """Test that non-timestamps are correctly rejected."""
        self.assertFalse(is_timestamp("Hello"))
        self.assertFalse(is_timestamp("10:30:45 AM"))  # Too specific
        self.assertFalse(is_timestamp(""))
        self.assertFalse(is_timestamp(None))
        self.assertFalse(is_timestamp("This is a message"))


class TestSenderNameDetection(unittest.TestCase):
    """Test cases for sender name heuristics."""

    def test_valid_sender_names(self):
        """Test valid sender name patterns."""
        self.assertTrue(is_sender_name("John"))
        self.assertTrue(is_sender_name("John Doe"))
        self.assertTrue(is_sender_name("Mom"))
        self.assertTrue(is_sender_name("Work Group"))

    def test_invalid_sender_names(self):
        """Test patterns that should not be detected as sender names."""
        self.assertFalse(is_sender_name("This is a very long message that contains many words"))
        self.assertFalse(is_sender_name(""))
        self.assertFalse(is_sender_name(None))
        self.assertFalse(is_sender_name("https://example.com"))
        self.assertFalse(is_sender_name("Hello, how are you?"))

    def test_edge_cases(self):
        """Test edge cases for sender name detection."""
        self.assertTrue(is_sender_name("A"))  # Single character
        self.assertTrue(is_sender_name("Dr Smith"))  # Title + name
        self.assertFalse(is_sender_name("A" * 60))  # Too long


class TestParseMessagesFromElements(unittest.TestCase):
    """Test cases for parsing messages from accessibility elements."""

    def setUp(self):
        """Set up test fixtures."""
        self.client = ScreenpipeClient(base_url="http://mock-server")

    def test_parse_basic_message_structure(self):
        """Test parsing a basic message with sender, text, and timestamp."""
        mock_elements = {
            "elements": [
                {"text": "John Doe", "role": "StaticText"},
                {"text": "Hello, how are you?", "role": "StaticText"},
                {"text": "10:30 AM", "role": "StaticText"},
            ]
        }

        messages = parse_messages_from_elements(mock_elements)

        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["sender"], "John Doe")
        self.assertIn("Hello", messages[0]["text"])
        self.assertEqual(messages[0]["timestamp"], "10:30 AM")

    def test_parse_multiple_messages(self):
        """Test parsing multiple consecutive messages."""
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
        self.assertEqual(messages[1]["timestamp"], "10:35 AM")

    def test_parse_empty_elements(self):
        """Test handling of empty elements list."""
        mock_elements = {"elements": []}
        messages = parse_messages_from_elements(mock_elements)
        self.assertEqual(len(messages), 0)

    def test_parse_elements_with_empty_text(self):
        """Test handling of elements with empty text."""
        mock_elements = {
            "elements": [
                {"text": "", "role": "StaticText"},
                {"text": "John", "role": "StaticText"},
                {"text": "Hello", "role": "StaticText"},
                {"text": "10:30 AM", "role": "StaticText"},
            ]
        }

        messages = parse_messages_from_elements(mock_elements)
        self.assertEqual(len(messages), 1)

    def test_parse_message_without_timestamp(self):
        """Test handling of messages without closing timestamp."""
        mock_elements = {
            "elements": [
                {"text": "John Doe", "role": "StaticText"},
                {"text": "This message has no timestamp", "role": "StaticText"},
            ]
        }

        messages = parse_messages_from_elements(mock_elements)
        self.assertEqual(len(messages), 1)
        self.assertIsNone(messages[0]["timestamp"])

    def test_parse_multiline_message(self):
        """Test parsing message that spans multiple elements."""
        mock_elements = {
            "elements": [
                {"text": "Alice", "role": "StaticText"},
                {"text": "First line of message", "role": "StaticText"},
                {"text": "Second line of message", "role": "StaticText"},
                {"text": "2:45 PM", "role": "StaticText"},
            ]
        }

        messages = parse_messages_from_elements(mock_elements)
        self.assertEqual(len(messages), 1)
        self.assertIn("First line", messages[0]["text"])
        self.assertIn("Second line", messages[0]["text"])


class TestParseMessagesFromText(unittest.TestCase):
    """Test cases for fallback text parsing."""

    def test_parse_basic_text(self):
        """Test parsing basic raw text."""
        raw_text = """
        Hello world
        10:30 AM
        How are you?
        10:35 AM
        """

        messages = parse_messages_from_text(raw_text)
        self.assertEqual(len(messages), 2)

    def test_parse_empty_text(self):
        """Test handling of empty text."""
        messages = parse_messages_from_text("")
        self.assertEqual(len(messages), 0)

    def test_parse_text_no_timestamps(self):
        """Test parsing text without any timestamps."""
        raw_text = "Hello\nWorld\nTest"
        messages = parse_messages_from_text(raw_text)
        self.assertEqual(len(messages), 1)


class TestScreenpipeClient(unittest.TestCase):
    """Test cases for ScreenpipeClient API interactions."""

    def setUp(self):
        """Set up test fixtures."""
        self.client = ScreenpipeClient(base_url="http://mock-server")

    @patch('requests.post')
    def test_add_ui_content_api(self, mock_post):
        """Test the add_ui_content API call structure."""
        mock_post.return_value = MagicMock()
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
        self.assertEqual(payload['content']['content_type'], 'ui')
        self.assertEqual(payload['content']['data']['text'], 'test message')
        self.assertEqual(payload['content']['data']['app_name'], 'WhatsApp')
        self.assertEqual(payload['content']['data']['window_name'], 'Test Window')

    @patch('requests.post')
    def test_add_ui_content_with_timestamp(self, mock_post):
        """Test add_ui_content with explicit timestamp."""
        mock_post.return_value = MagicMock()
        mock_post.return_value.json.return_value = {"success": True}

        test_timestamp = "2024-01-15T10:30:00+00:00"
        response = self.client.add_ui_content(
            device_name="test-device",
            text="test message",
            app_name="WhatsApp",
            window_name="Test Window",
            timestamp=test_timestamp
        )

        args, kwargs = mock_post.call_args
        payload = kwargs['json']
        self.assertEqual(payload['content']['data']['timestamp'], test_timestamp)

    @patch('requests.post')
    def test_open_application(self, mock_post):
        """Test opening an application."""
        mock_post.return_value = MagicMock()
        mock_post.return_value.json.return_value = {"success": True}

        response = self.client.open_application("WhatsApp")

        self.assertTrue(response["success"])
        args, kwargs = mock_post.call_args
        self.assertIn("open-application", args[0])

    @patch('requests.post')
    def test_get_text(self, mock_post):
        """Test getting text from application."""
        mock_post.return_value = MagicMock()
        mock_post.return_value.json.return_value = {"success": True, "text": "Hello World"}

        response = self.client.get_text("WhatsApp", window_name="Chat")

        self.assertTrue(response["success"])
        args, kwargs = mock_post.call_args
        self.assertEqual(kwargs['json']['app_name'], "WhatsApp")
        self.assertEqual(kwargs['json']['window_name'], "Chat")

    @patch('requests.post')
    def test_list_interactable_elements(self, mock_post):
        """Test listing interactable elements."""
        mock_post.return_value = MagicMock()
        mock_post.return_value.json.return_value = {
            "elements": [{"text": "Button", "role": "Button"}]
        }

        response = self.client.list_interactable_elements("WhatsApp")

        self.assertIn("elements", response)
        args, kwargs = mock_post.call_args
        self.assertIn("list-interactable-elements", args[0])

    @patch('requests.post')
    def test_click_element(self, mock_post):
        """Test clicking an element."""
        mock_post.return_value = MagicMock()
        mock_post.return_value.json.return_value = {"success": True}

        response = self.client.click_element("WhatsApp", "Button:Send")

        self.assertTrue(response["success"])
        args, kwargs = mock_post.call_args
        self.assertEqual(kwargs['json']['selector']['locator'], "Button:Send")

    @patch('requests.post')
    def test_type_text(self, mock_post):
        """Test typing text into an element."""
        mock_post.return_value = MagicMock()
        mock_post.return_value.json.return_value = {"success": True}

        response = self.client.type_text("WhatsApp", "TextField:Message", "Hello!")

        self.assertTrue(response["success"])
        args, kwargs = mock_post.call_args
        self.assertEqual(kwargs['json']['text'], "Hello!")

    @patch('requests.get')
    def test_health_check_healthy(self, mock_get):
        """Test health check when server is healthy."""
        mock_get.return_value = MagicMock()
        mock_get.return_value.status_code = 200

        result = self.client.health_check()
        self.assertTrue(result)

    @patch('requests.get')
    def test_health_check_unhealthy(self, mock_get):
        """Test health check when server is unhealthy."""
        mock_get.return_value = MagicMock()
        mock_get.return_value.status_code = 500

        result = self.client.health_check()
        self.assertFalse(result)

    @patch('requests.get')
    def test_health_check_connection_error(self, mock_get):
        """Test health check when server is unreachable."""
        import requests
        mock_get.side_effect = requests.exceptions.ConnectionError()

        result = self.client.health_check()
        self.assertFalse(result)


class TestScrapeWhatsApp(unittest.TestCase):
    """Test cases for the main scrape_whatsapp function."""

    @patch.object(ScreenpipeClient, 'open_application')
    @patch.object(ScreenpipeClient, 'list_interactable_elements')
    @patch.object(ScreenpipeClient, 'add_ui_content')
    @patch('time.sleep')
    def test_scrape_with_elements(self, mock_sleep, mock_add, mock_list, mock_open):
        """Test scraping when elements are available."""
        mock_open.return_value = {"success": True}
        mock_list.return_value = {
            "elements": [
                {"text": "John", "role": "StaticText"},
                {"text": "Hello!", "role": "StaticText"},
                {"text": "10:30 AM", "role": "StaticText"},
            ]
        }
        mock_add.return_value = {"success": True}

        client = ScreenpipeClient()
        messages = scrape_whatsapp(client, "John", ingest=True)

        self.assertEqual(len(messages), 1)
        mock_add.assert_called()

    @patch.object(ScreenpipeClient, 'open_application')
    @patch.object(ScreenpipeClient, 'list_interactable_elements')
    @patch.object(ScreenpipeClient, 'get_text')
    @patch.object(ScreenpipeClient, 'add_ui_content')
    @patch('time.sleep')
    def test_scrape_fallback_to_text(self, mock_sleep, mock_add, mock_get_text, mock_list, mock_open):
        """Test fallback to text extraction when no elements found."""
        mock_open.return_value = {"success": True}
        mock_list.return_value = {"elements": []}
        mock_get_text.return_value = {"success": True, "text": "Hello\n10:30 AM"}
        mock_add.return_value = {"success": True}

        client = ScreenpipeClient()
        messages = scrape_whatsapp(client, "Contact", ingest=True)

        mock_get_text.assert_called()

    @patch.object(ScreenpipeClient, 'open_application')
    @patch.object(ScreenpipeClient, 'list_interactable_elements')
    @patch('time.sleep')
    def test_scrape_no_ingest(self, mock_sleep, mock_list, mock_open):
        """Test scraping without ingesting to database."""
        mock_open.return_value = {"success": True}
        mock_list.return_value = {
            "elements": [
                {"text": "Hello", "role": "StaticText"},
                {"text": "10:30 AM", "role": "StaticText"},
            ]
        }

        client = ScreenpipeClient()
        with patch.object(client, 'add_ui_content') as mock_add:
            messages = scrape_whatsapp(client, "Contact", ingest=False)
            mock_add.assert_not_called()

    @patch.object(ScreenpipeClient, 'open_application')
    @patch('time.sleep')
    def test_scrape_open_app_failure(self, mock_sleep, mock_open):
        """Test handling when opening app fails."""
        mock_open.side_effect = Exception("Failed to open")

        client = ScreenpipeClient()
        messages = scrape_whatsapp(client, "Contact")

        self.assertEqual(len(messages), 0)


class TestEdgeCases(unittest.TestCase):
    """Test edge cases and error handling."""

    def test_parse_elements_missing_key(self):
        """Test handling of elements missing expected keys."""
        mock_elements = {
            "elements": [
                {"role": "StaticText"},  # Missing 'text' key
                {"text": "Hello", "role": "StaticText"},
                {"text": "10:30 AM", "role": "StaticText"},
            ]
        }

        messages = parse_messages_from_elements(mock_elements)
        self.assertEqual(len(messages), 1)

    def test_parse_elements_malformed_structure(self):
        """Test handling of completely malformed input."""
        messages = parse_messages_from_elements({})
        self.assertEqual(len(messages), 0)

        messages = parse_messages_from_elements({"elements": None})
        self.assertEqual(len(messages), 0)

    def test_unicode_handling(self):
        """Test handling of Unicode characters (emojis, non-ASCII)."""
        mock_elements = {
            "elements": [
                {"text": "John 🎉", "role": "StaticText"},
                {"text": "Hello! 👋 How are you?", "role": "StaticText"},
                {"text": "10:30 AM", "role": "StaticText"},
            ]
        }

        messages = parse_messages_from_elements(mock_elements)
        self.assertEqual(len(messages), 1)
        self.assertIn("👋", messages[0]["text"])

    def test_special_characters_in_messages(self):
        """Test handling of special characters."""
        mock_elements = {
            "elements": [
                {"text": "User", "role": "StaticText"},
                {"text": "Check this: https://example.com?foo=bar&baz=qux", "role": "StaticText"},
                {"text": "10:30 AM", "role": "StaticText"},
            ]
        }

        messages = parse_messages_from_elements(mock_elements)
        self.assertEqual(len(messages), 1)
        self.assertIn("https://example.com", messages[0]["text"])

    def test_very_long_messages(self):
        """Test handling of very long messages."""
        long_text = "A" * 10000

        mock_elements = {
            "elements": [
                {"text": "User", "role": "StaticText"},
                {"text": long_text, "role": "StaticText"},
                {"text": "10:30 AM", "role": "StaticText"},
            ]
        }

        messages = parse_messages_from_elements(mock_elements)
        self.assertEqual(len(messages), 1)
        self.assertEqual(len(messages[0]["text"]), 10000)


class TestIntegration(unittest.TestCase):
    """Integration tests that simulate real-world scenarios."""

    def test_real_world_whatsapp_structure(self):
        """Test with a structure that mimics real WhatsApp accessibility tree."""
        mock_elements = {
            "elements": [
                # First message
                {"text": "Mom", "role": "StaticText"},
                {"text": "Don't forget to call grandma today!", "role": "StaticText"},
                {"text": "9:15 AM", "role": "StaticText"},
                # Second message (reply)
                {"text": "You", "role": "StaticText"},
                {"text": "Will do! Thanks for reminding me.", "role": "StaticText"},
                {"text": "9:20 AM", "role": "StaticText"},
                # Third message with emoji
                {"text": "Mom", "role": "StaticText"},
                {"text": "❤️", "role": "StaticText"},
                {"text": "9:21 AM", "role": "StaticText"},
            ]
        }

        messages = parse_messages_from_elements(mock_elements)

        self.assertEqual(len(messages), 3)
        self.assertEqual(messages[0]["sender"], "Mom")
        self.assertEqual(messages[1]["sender"], "You")
        self.assertEqual(messages[2]["text"], "❤️")


if __name__ == '__main__':
    # Run tests with verbose output
    unittest.main(verbosity=2)
