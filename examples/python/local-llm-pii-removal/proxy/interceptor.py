import json
import logging

import dotenv
import openai
from pii import DEFAULT_PII_TYPES, generate_system_prompt
from mitmproxy import http

dotenv.load_dotenv()

# configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# create a file handler
file_handler = logging.FileHandler("interceptor.log")
file_handler.setLevel(logging.DEBUG)

# create a console handler
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.DEBUG)

# create a logging format
formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
file_handler.setFormatter(formatter)
console_handler.setFormatter(formatter)

# add the handlers to the logger
logger.addHandler(file_handler)
logger.addHandler(console_handler)

class Interceptor:

    def __init__(self):
        self.client = openai.OpenAI(
            base_url="http://localhost:11434/api",
            api_key="nope",
        )
        self.request_store = {}

    def request(self, flow: http.HTTPFlow) -> None:

        if (
            flow.request.host != "chatgpt.com"
            or flow.request.path != "/backend-api/conversation"
        ):
            return

        content_type = flow.request.headers.get("Content-Type", "text/plain")
        if content_type == "application/json":
            logger.info(f"body: {json.dumps(flow.request.json(), indent=2)}")
        else:
            logger.info(f"body: {flow.request.text}")

        content_type = flow.request.headers.get("Content-Type", "text/plain")
        request_content = (
            json.dumps(flow.request.json())
            if content_type == "application/json"
            else flow.request.text
        )
        logger.debug(f"request content: {request_content}")

        system_prompt = generate_system_prompt(DEFAULT_PII_TYPES, content_type)
        logger.debug(f"system prompt: {system_prompt}")

        try:
            chat_completion = self.client.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": system_prompt,
                    },
                    {
                        "role": "user",
                        "content": request_content,
                    },
                ],
                model="solar-pro:22b-preview-instruct-q2_K",
                response_format={"type": "json_object"},
                stream=False,
            )
            logger.debug(f"chat completion: {chat_completion}")
        except Exception as e:
            logger.error(f"error in chat completion: {e}")
            return

        self.request_store[flow.request.host] = flow.request.content
        flow.request.headers["Origin"] = "http://localhost:8080"
        obscured_body = chat_completion.choices[0].message.content
        logger.debug(f"obscured body: {obscured_body}")

        # ensure proper JSON output
        if content_type == "application/json":
            try:
                # parse the LLM output as JSON
                json_body = json.loads(obscured_body)
                # re-serialize to ensure proper formatting
                obscured_body = json.dumps(json_body)
            except json.JSONDecodeError:
                logger.error(
                    "LLM output is not valid JSON. falling back to original request."
                )
                obscured_body = request_content

        flow.request.set_text(obscured_body)
        logger.info(obscured_body)

    def response(self, flow: http.HTTPFlow) -> None:
        flow.response.headers["Access-Control-Allow-Origin"] = "*"


addons = [Interceptor()]
