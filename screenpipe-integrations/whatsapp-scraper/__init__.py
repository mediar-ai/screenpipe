"""
WhatsApp Scraper Integration for Screenpipe
Implements bounty #1441 - General Purpose Scraper
"""
from .whatsapp_scraper import (
    ScreenpipeClient,
    parse_messages_from_elements,
    parse_messages_from_text,
    is_timestamp,
    is_sender_name,
    scrape_whatsapp
)

__all__ = [
    'ScreenpipeClient',
    'parse_messages_from_elements',
    'parse_messages_from_text',
    'is_timestamp',
    'is_sender_name',
    'scrape_whatsapp'
]

__version__ = '0.1.0'
