from enum import Enum

class PIIType(str, Enum):
    FULL_NAME = "Full Name"
    CREDIT_CARD = "Credit Card Number"
    SSN = "Social Security Number (SSN)"
    PHONE = "Phone Number"
    EMAIL = "Email Address"
    ADDRESS = "Address"
    PASSPORT = "Passport Number"
    DRIVERS_LICENSE = "Driver's License Number"
    BANK_ACCOUNT = "Bank Account Number"
    MEDICAL_RECORD = "Medical Record Number"
    IP_ADDRESS = "IP Address"
    LOGIN_CREDENTIALS = "Login Credentials"
    BIOMETRIC_DATA = "Biometric Data"
    DATE_OF_BIRTH = "Date of Birth"
    DEVELOPER_API_KEY = "Developer API Key"
    OAUTH_TOKEN = "OAuth Token"
    GITHUB_TOKEN = "GitHub Token"
    AWS_ACCESS_KEY = "AWS Access Key"
    GOOGLE_API_KEY = "Google API Key"
    STRIPE_API_KEY = "Stripe API Key"
    API_KEY = "API Key"
    ACCESS_TOKEN = "Access Token"
    JWT = "JWT"
    def __str__(self):
        return self.value

PII_RULES = {
    PIIType.FULL_NAME: {
        "detection": "Two consecutive capitalized words",
        "replacement": "John Doe for males, Jane Doe for females, or Alex Doe if unclear",
        "example": "Vikram Subbiah"
    },
    PIIType.CREDIT_CARD: {
        "detection": "16-digit patterns, with or without spaces or dashes",
        "replacement": "Random 16-digit number (following Luhn algorithm)",
        "example": "4242 4242 4242 4242"
    },
    PIIType.SSN: {
        "detection": "9-digit patterns, often `XXX-XX-XXXX` or continuous digits",
        "replacement": "123-45-6789",
        "example": "012-34-5678"
    },
    PIIType.PHONE: {
        "detection": "Patterns of 10 or more digits, with dashes, spaces, or parentheses",
        "replacement": "(555) 555-5555",
        "example": "(555) 123-4567"
    },
    PIIType.EMAIL: {
        "detection": "Patterns resembling emails (e.g., `example@domain.com`)",
        "replacement": "user@example.com",
        "example": "jane.doe@example.com"
    },
    PIIType.ADDRESS: {
        "detection": "Patterns resembling addresses (e.g., street names, city, ZIP codes)",
        "replacement": "1234 Elm Street, Anytown, USA",
        "example": "789 Oak Street, Springfield"
    },
    PIIType.PASSPORT: {
        "detection": "Alphanumeric patterns, 9 to 12 characters long",
        "replacement": "A12345678",
        "example": "A12345678"
    },
    PIIType.DRIVERS_LICENSE: {
        "detection": "Alphanumeric patterns, 7 to 15 characters long",
        "replacement": "D123-4567-8901",
        "example": "D123-4567-8901"
    },
    PIIType.BANK_ACCOUNT: {
        "detection": "Alphanumeric patterns, 8 to 12 digits long",
        "replacement": "1234567890",
        "example": "1234567890"
    },
    PIIType.MEDICAL_RECORD: {
        "detection": "Alphanumeric patterns, 8 to 20 characters long",
        "replacement": "MR123456789",
        "example": "MR987654321"
    },
    PIIType.IP_ADDRESS: {
        "detection": "Patterns resembling IP addresses (e.g., `192.168.0.1`)",
        "replacement": "10.0.0.1",
        "example": "192.168.1.1"
    },
    PIIType.LOGIN_CREDENTIALS: {
        "detection": "Patterns resembling usernames and passwords",
        "replacement": "username123 and password123",
        "example": "admin:password123"
    },
    PIIType.BIOMETRIC_DATA: {
        "detection": "Patterns resembling biometric identifiers (e.g., fingerprints)",
        "replacement": "BIO123456",
        "example": "FNG123456"
    },
    PIIType.DATE_OF_BIRTH: {
        "detection": "Date patterns (e.g., `MM/DD/YYYY` or `YYYY-MM-DD`)",
        "replacement": "01/01/1900",
        "example": "12/31/2000"
    },
    PIIType.DEVELOPER_API_KEY: {
        "detection": "Alphanumeric patterns, often 32 characters long",
        "replacement": "sk-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        "example": "sk-abcdefghijklmnopqrstuvwxyz0123456789ABCDEF"
    },
     PIIType.API_KEY: {
        "detection": "Alphanumeric strings with specific prefixes or patterns (e.g., 'api_', 'key_')",
        "replacement": "API_KEY_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        "example": "api_1234567890abcdef"
    },
    PIIType.ACCESS_TOKEN: {
        "detection": "Long alphanumeric strings, often with hyphens or underscores",
        "replacement": "ACCESS_TOKEN_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        "example": "ghp_1234567890abcdef1234567890abcdef12345678"
    },
    PIIType.JWT: {
        "detection": "Three base64-encoded strings separated by dots",
        "replacement": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
        "example": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    },
    PIIType.OAUTH_TOKEN: {
        "detection": "Alphanumeric strings often starting with 'ya29.' or other specific prefixes",
        "replacement": "ya29.OAUTH_TOKEN_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        "example": "ya29.a0AfH6SMBx8XzXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    },
    PIIType.GITHUB_TOKEN: {
        "detection": "Alphanumeric strings starting with 'ghp_', 'gho_', 'ghu_', or 'ghs_'",
        "replacement": "ghp_GITHUB_TOKEN_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        "example": "ghp_1234567890abcdef1234567890abcdef12345678"
    },
    PIIType.AWS_ACCESS_KEY: {
        "detection": "20-character alphanumeric strings often starting with 'AKIA'",
        "replacement": "AKIAXXXXXXXXXXXXXXXXXXXXXXXX",
        "example": "AKIAIOSFODNN7EXAMPLE"
    },
    PIIType.GOOGLE_API_KEY: {
        "detection": "Alphanumeric strings often starting with 'AIza'",
        "replacement": "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        "example": "AIzaSyDrQ9efsQZYbDgfNPMLQq8e_yfXQhYYqCk"
    },
    PIIType.STRIPE_API_KEY: {
        "detection": "Alphanumeric strings starting with 'sk_live_' or 'pk_live_'",
        "replacement": "sk_live_STRIPE_API_KEY_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        "example": "sk_live_1234567890abcdefghijklmnopqrstuvwxyz"
    },
}

DEFAULT_PII_TYPES = [
    PIIType.CREDIT_CARD,
    PIIType.FULL_NAME,
    PIIType.SSN,
    PIIType.EMAIL,
    PIIType.ADDRESS,
    PIIType.PASSPORT,
    PIIType.DRIVERS_LICENSE,
    PIIType.BANK_ACCOUNT,
    PIIType.MEDICAL_RECORD,
    PIIType.IP_ADDRESS,
    PIIType.LOGIN_CREDENTIALS,
    PIIType.BIOMETRIC_DATA,
    PIIType.DATE_OF_BIRTH,
    PIIType.DEVELOPER_API_KEY
]

def generate_system_prompt(selected_pii_types=DEFAULT_PII_TYPES, content_type="application/json"):
    detection_and_replacement = [
        f'   - **{pii.value}**: Detect by {PII_RULES[pii]["detection"]}.\n'
        f'     Replace with {PII_RULES[pii]["replacement"]}. Example: {PII_RULES[pii]["example"]}.\n'
        for pii in selected_pii_types
    ]
    
    json_fields = [
        f'   - "{pii.value}": "<Obscured {pii.value.lower()}>"\n' 
        for pii in selected_pii_types
    ]
    
    json_response = ''.join(json_fields)
    
    return f"""
You are an AI specialized in detecting and obscuring Personal Identifiable Information (PII) in unstructured text. Given an input string, your task is to:

1. **Implicitly Detect PII**:
{''.join(detection_and_replacement)}

2. **Obscure the Detected PII** with randomized or default values that closely match the format to pass validation, but not verification. ONLY DO SO FOR ANY FIELDS PRESENT AND DO NOT ADD ANY OTHER FIELDS NOT PRESENT IN THE ORIGINAL REQUEST:
{''.join(detection_and_replacement)}

""" + preserve_content_type(content_type)

def preserve_content_type(content_type: str):
    if content_type == "application/json":
        return """3. **Respond in JSON format**:
   ```json
   {
{json_response}
   }
"""
    elif content_type =="text/plain":
        return """3. **Respond in PLAIN TEXT format ONLY**:
    ```text
{ text_response }
"""
