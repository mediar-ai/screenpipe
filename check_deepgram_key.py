import os

def check_deepgram_api_key():
    api_key = os.getenv('DEEPGRAM_API_KEY')
    if not api_key:
        print("❌ Error: Deepgram API key is missing.")
        print("👉 Solution: Set it using:")
        print("   export DEEPGRAM_API_KEY=your_api_key")
        return False
    return True

def check_screenpipe_cloud_key():
    cloud_key = os.getenv('SCREENPIPE_CLOUD_KEY')
    if not cloud_key:
        print("❌ Error: Screenpipe Cloud API key is missing.")
        print("👉 Solution: Set it using:")
        print("   export SCREENPIPE_CLOUD_KEY=your_api_key")
        return False

    # Since we cannot check the subscription, warn the user instead
    print("⚠️ Warning: Could not verify Screenpipe Cloud subscription.")
    print("👉 Solution: Ensure you are subscribed at https://screenpi.pe.")
    return True  

if __name__ == "__main__":
    deepgram_ok = check_deepgram_api_key()
    screenpipe_ok = check_screenpipe_cloud_key()

    if deepgram_ok and screenpipe_ok:
        print("✅ All required API keys are set. Proceeding with real-time audio.")
    else:
        print("❌ Please fix the errors above before proceeding.")

