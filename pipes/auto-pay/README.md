Automatically trigger bank transfers based on screen activity. The pipe monitors your screen for payment-related information and can initiate transfers through the Wise API.


Right now it simplifies the preparation and requires human-in-the-loop to confirm the transfer.

> ⚠️ **Early Development Notice**: This pipe is in active development and subject to breaking changes. The API, UI, and functionality may change significantly as we improve the system.

## Features

- Real-time screen monitoring to detect payment information
- Automatic extraction of payment details:
  - Recipient name and email
  - Payment amount and currency
  - Bank account details (routing and account numbers)
  - Reference notes and descriptions
- Secure bank transfer initiation via Wise API
- Support for both email and bank account transfers
- Automatic quote creation and recipient management
- Transfer requirement validation for different currency corridors

## How it Works

The pipe follows a three-stage process:

1. **Browse & Monitor**
   - Continuously monitors your screen activity using screenpipe's OCR
   - Captures text from various sources (browsers, PDFs, emails)
   - Stores data locally for privacy and quick access

2. **Detect & Extract**
   - AI models analyze captured text to identify payment information
   - Extracts structured data like amounts, recipients, and bank details
   - Assigns confidence scores to detected payments
   - Presents findings for your review

3. **Prepare & Execute**
   - Validates extracted information against Wise requirements
   - Creates necessary recipient records and quotes
   - Handles currency conversion if needed
   - Initiates transfer after your confirmation

## Setup & Testing

### Prerequisites
- OpenAI API key (for payment detection)
- Wise API credentials:
  - API Key
  - Profile ID

### Testing Flow

1. **Start with Sandbox**
   ```json
   // pipe.json settings
   {
     "wiseApiKey": "your-sandbox-api-key",
     "wiseProfileId": "your-profile-id",
     "enableProduction": false  // Keep false for testing
   }
   ```

2. **Test Payment Detection**
   - Open an invoice or payment details in your browser/PDF viewer
   - Click "Start Detection" in the Auto-Pay interface
   - Review detected payment information
   - Confidence scores help evaluate detection accuracy

3. **Test Transfer Creation**
   - Use Wise Sandbox credentials first
   - Transfers will be created in test mode
   - Monitor the process in Wise Sandbox dashboard
   - Check transfer statuses and notifications

### Moving to Production

1. Update `pipe.json` with production credentials
2. Set `enableProduction` to `true`
3. Thoroughly test with small amounts first
4. Monitor transfer execution closely

## Privacy & Security

- 100% private, runs locally on your computer
- Uses local AI models (llama3.2, phi4, etc.)
- Requires ~5GB RAM including the screenpipe stack
- Sensitive data never leaves your machine
- Bank transfers require explicit user confirmation

## Example Use Cases

- Automating recurring vendor payments
- Processing invoices from emails
- Handling international transfers
- Managing contractor payments

## Known Limitations

- Currently optimized for English language content
- Best results with clearly structured payment information
- May require manual correction for complex invoices
- Transfer speeds depend on Wise processing times

## Future Improvements

- Multi-language support
- Enhanced OCR accuracy
- Batch payment processing
- Custom validation rules
- Integration with accounting software

<img width="1312" alt="Screenshot 2024-12-21 at 4 39 29 PM" src="https://github.com/user-attachments/assets/2e395762-198f-43e6-9e5a-2974b8e71fcf" />
