import { desktopClient } from './start-here';
import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Use the correct type from Anthropic SDK
let conversationHistory: {role: "user" | "assistant"; content: string}[] = [];

export async function processUserQuery(query: string) {

  // Get available tools
  const toolsResponse = await desktopClient.listTools();
  const tools = toolsResponse.tools.map(tool => ({
    name: tool.name,
    description: tool.description || "",
    input_schema: tool.inputSchema
  }));
  
  // Add new user message with correct literal type
  conversationHistory.push({ 
    role: "user" as const, 
    content: query 
  });
  
  // Call Claude with tools and history
  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    messages: conversationHistory,
    tools,
  });
  
  // Process the response and handle tool calls
  let finalResponse = "";
  
  for (const content of response.content) {
    if (content.type === "text") {
      finalResponse += content.text;
    } else if (content.type === "tool_use") {
      // Extract tool call information
      const toolName = content.name;
      const toolArgs = content.input;
      
      // Execute the tool via MCP
      try {
        const result = await desktopClient.callTool(toolName, toolArgs as Record<string, any>);
        
        // Send tool result back to LLM
        const toolResultMessage = {
          role: "user" as const, 
          content: [
            {
              type: "tool_result",
              tool_use_id: content.id,
              content: result
            }
          ]
        };
        
        // Get final response with tool result
        const newConversation = [
          // Add user's original query
          { role: "user" as const, content: query },
          // Add assistant's tool use
          { role: "assistant" as const, content: `I'll help you with that using a tool.` },
          // Add tool result as user message
          { role: "user" as const, content: `Tool result: ${JSON.stringify(result)}` }
        ];
        
        const finalLLMResponse = await anthropic.messages.create({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1024,
          messages: newConversation
        });
        
        // Check content type before accessing text property
        if (finalLLMResponse.content[0].type === 'text') {
          finalResponse += finalLLMResponse.content[0].text;
        }
      } catch (error) {
        finalResponse += `\n[Error executing tool ${toolName}: ${error}]`;
      }
    }
  }
  
  // Add Claude's response to history before returning
  if (response.content[0]?.type === "text") {
    conversationHistory.push({ 
      role: "assistant" as const, 
      content: response.content[0].text 
    });
  }
  
  return finalResponse;
}
