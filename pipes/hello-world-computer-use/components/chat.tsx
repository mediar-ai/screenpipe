"use client";

import { useEffect, useState } from "react";
import { AIPresetsSelector } from "./ai-presets-selector";
import { convertToCoreMessages, Message, streamText } from "ai";
import { useSettings } from "@/lib/hooks/use-settings";
import { usePipeSettings } from "@/lib/hooks/use-pipe-settings";
import { toast } from "sonner";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { ollama } from "ollama-ai-provider";
import { ElementInfo, pipe } from "@screenpipe/browser";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// OS detection utility
const detectOS = (): {
  currentOS: string;
  isMacOS: boolean;
  isWindows: boolean;
  isLinux: boolean;
} => {
  const userAgent = window.navigator.userAgent;
  let currentOS = "Unknown";

  if (userAgent.indexOf("Win") !== -1) currentOS = "Windows";
  else if (userAgent.indexOf("Mac") !== -1) currentOS = "Darwin";
  else if (userAgent.indexOf("Linux") !== -1) currentOS = "Linux";
  else if (userAgent.indexOf("X11") !== -1) currentOS = "Unix";

  return {
    currentOS,
    isMacOS: currentOS === "Darwin",
    isWindows: currentOS === "Windows",
    isLinux: currentOS === "Linux",
  };
};

const getBrowserName = () => {
  if (
    getComputedStyle(document.documentElement).getPropertyValue(
      "--arc-palette-title"
    )
  )
    return "arc";
  const userAgent = window.navigator.userAgent;

  if (userAgent.includes("Firefox")) return "firefox";
  if (userAgent.includes("Edge") || userAgent.includes("Edg")) return "edge";
  if (userAgent.includes("Chrome") && !userAgent.includes("Edg"))
    return "chrome";
  if (userAgent.includes("Safari") && !userAgent.includes("Chrome"))
    return "safari";
  if (userAgent.includes("Opera") || userAgent.includes("OPR")) return "opera";

  return "unknown";
};

// Cross-platform tools available on all OSes
const crossPlatformTools = {
  // tool to add delay between actions
  delay: {
    description:
      "Add a delay between actions. Useful between app switches with open application, open url, or activateApp thing",
    parameters: z.object({
      seconds: z.number().describe("The number of seconds to delay"),
    }),
    execute: async ({ seconds }: { seconds: number }) => {
      console.log("[tool:delay] params:", { seconds });
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      return `Successfully delayed for ${seconds} seconds`;
    },
  },
  pixel_type: {
    description: "Type text directly without focusing on a specific element",
    parameters: z.object({
      text: z.string().describe("The text to type"),
    }),
    execute: async ({ text }: { text: string }) => {
      console.log("[tool:pixel_type] params:", { text });
      try {
        const success = await pipe.operator.pixel.type(text);
        console.log("[tool:pixel_type] result:", success);
        return success
          ? `Successfully typed text: "${text}"`
          : `Failed to type text`;
      } catch (error) {
        console.error("[tool:pixel_type] error:", error);
        throw new Error(`Failed to type text: ${error}`);
      }
    },
  },

  pixel_press: {
    description: "Press a keyboard key or key combination",
    parameters: z.object({
      key: z
        .string()
        .describe("The key to press (e.g., 'enter', 'tab', 'esc')"),
    }),
    execute: async ({ key }: { key: string }) => {
      console.log("[tool:pixel_press] params:", { key });
      try {
        const success = await pipe.operator.pixel.press(key);
        console.log("[tool:pixel_press] result:", success);
        return success
          ? `Successfully pressed key: "${key}"`
          : `Failed to press key`;
      } catch (error) {
        console.error("[tool:pixel_press] error:", error);
        throw new Error(`Failed to press key: ${error}`);
      }
    },
  },

  pixel_move_mouse: {
    description: "Move the mouse cursor to specific coordinates",
    parameters: z.object({
      x: z.number().describe("The X coordinate to move to"),
      y: z.number().describe("The Y coordinate to move to"),
    }),
    execute: async ({ x, y }: { x: number; y: number }) => {
      console.log("[tool:pixel_move_mouse] params:", { x, y });
      try {
        const success = await pipe.operator.pixel.moveMouse(x, y);
        console.log("[tool:pixel_move_mouse] result:", success);
        return success
          ? `Successfully moved mouse to coordinates (${x}, ${y})`
          : `Failed to move mouse`;
      } catch (error) {
        console.error("[tool:pixel_move_mouse] error:", error);
        throw new Error(`Failed to move mouse: ${error}`);
      }
    },
  },

  pixel_click: {
    description: "Click a mouse button at the current cursor position",
    parameters: z.object({
      button: z
        .enum(["left", "right", "middle"])
        .describe("The mouse button to click"),
    }),
    execute: async ({ button }: { button: "left" | "right" | "middle" }) => {
      console.log("[tool:pixel_click] params:", { button });
      try {
        const success = await pipe.operator.pixel.click(button);
        console.log("[tool:pixel_click] result:", success);
        return success
          ? `Successfully clicked ${button} mouse button`
          : `Failed to click mouse button`;
      } catch (error) {
        console.error("[tool:pixel_click] error:", error);
        throw new Error(`Failed to click mouse button: ${error}`);
      }
    },
  },
};

// MacOS-only tools
const macOSTools = {
  click: {
    description: "Click an element in an application",
    parameters: z.object({
      app: z.string().describe("The name of the application"),
      id: z.string().describe("Id of the element"),
    }),
    execute: async ({ app, id }: { app: string; id: string }) => {
      console.log("[tool:click] params:", {
        app,
        id,
      });
      try {
        const result = await pipe.operator
          .getById(id, {
            app,
            activateApp: true,
            useBackgroundApps: true,
          })
          .click();
        console.log("[tool:click] result:", result);
        return `Successfully clicked element using ${result.method}`;
      } catch (error) {
        console.error("[tool:click] error:", error);
        throw new Error(`Failed to click element: ${error}`);
      }
    },
  },

  fill: {
    description: "Fill text in a form field",
    parameters: z.object({
      id: z.string().describe("The id of the element"),
      app: z.string().describe("The name of the application"),
      value: z.string().describe("The text to type into the field"),
    }),
    execute: async ({
      id,
      app,
      value,
    }: {
      id: string;
      app: string;
      value: string;
    }) => {
      console.log("[tool:fill] params:", {
        id,
        app,
        value,
      });
      try {
        console.log("[tool:fill] trying to fill", {
          id,
          app,
          value,
        });
        const success = await pipe.operator
          .getById(id, {
            app,
            activateApp: true,
            useBackgroundApps: true,
          })
          .fill(value);
        console.log("[tool:fill] result:", success);
        return success ? `Successfully entered text` : `Failed to enter text`;
      } catch (error) {
        console.error("[tool:fill] error:", error);
        throw new Error(`Failed to fill text field: ${error}`);
      }
    },
  },

  open_application: {
    description: "Open an application",
    parameters: z.object({
      appName: z.string().describe("The name of the application to open"),
    }),
    execute: async ({ appName }: { appName: string }) => {
      try {
        console.log("[tool:open_application] params:", {
          appName,
        });
        const success = await pipe.operator
          .openApplication(appName)
          .catch((error) => {
            console.warn("[tool:open_application] error:", error);
            // kinda unreliable, sometimes it just open but throw error
            return true;
            // throw new Error(`Failed to open application: ${error}`);
          });
        return success
          ? `Successfully opened application '${appName}'`
          : `Failed to open application '${appName}'`;
      } catch (error) {
        throw new Error(`Failed to open application: ${error}`);
      }
    },
  },

  open_url: {
    description: "Open a URL in a browser",
    parameters: z.object({
      url: z.string().describe("The URL to open"),
      browser: z.string().optional().describe("The browser to use"),
    }),
    execute: async ({ url, browser }: { url: string; browser?: string }) => {
      try {
        console.log("[tool:open_url] params:", {
          url,
          browser,
        });
        const success = await pipe.operator.openUrl(url, browser);
        console.log("[tool:open_url] result:", success);
        return success
          ? `Successfully opened URL '${url}'${browser ? ` in ${browser}` : ""}`
          : `Failed to open URL '${url}'`;
      } catch (error) {
        throw new Error(`Failed to open URL: ${error}`);
      }
    },
  },

  find_by_role: {
    description: "Find elements with a specific role",
    parameters: z.object({
      app: z
        .string()
        .describe("The application name (e.g., 'Chrome', 'Firefox', 'Arc')"),
      role: z.string().describe("The role to search for"),
      maxResults: z
        .number()
        .optional()
        .describe("Maximum number of elements to return"),
    }),
    execute: async ({
      app,
      role,
      maxResults,
    }: {
      app: string;
      role: string;
      maxResults?: number;
    }) => {
      console.log("[tool:find_by_role] params:", {
        app,
        role,
        maxResults,
      });
      try {
        const elements = await pipe.operator
          .getByRole(role, {
            app,
            activateApp: true,
            useBackgroundApps: true,
          })
          .all(maxResults);
        console.log("[tool:find_by_role] found elements:", elements);
        return JSON.stringify(elements);
      } catch (error) {
        console.error("[tool:find_by_role] error:", error);
        throw new Error(`Failed to find elements by role: ${error}`);
      }
    },
  },

  scroll: {
    description: "Scroll an element in a specific direction",
    parameters: z.object({
      app: z.string().describe("The name of the application"),
      id: z.string().optional().describe("Id of the element"),
      direction: z
        .enum(["up", "down", "left", "right"])
        .describe("Direction to scroll"),
      amount: z.number().describe("Amount to scroll in pixels"),
    }),
    execute: async ({
      app,
      id,
      direction,
      amount,
    }: {
      app: string;
      id?: string;
      direction: "up" | "down" | "left" | "right";
      amount: number;
    }) => {
      console.log("[tool:scroll] params:", {
        app,
        id,
        direction,
        amount,
      });
      try {
        if (!id) {
          throw new Error("Element id is required");
        }
        const success = await pipe.operator
          .getById(id, {
            app,
            activateApp: true,
            useBackgroundApps: true,
          })
          .scroll(direction, amount);
        console.log("[tool:scroll] result:", success);
        return success
          ? `Successfully scrolled element ${direction} by ${amount}px`
          : "Failed to scroll element";
      } catch (error) {
        console.error("[tool:scroll] error:", error);
        throw new Error(`Failed to scroll element: ${error}`);
      }
    },
  },
};

// Add this new component after the detectOS function or before the Chat component
const QuickActionCard = ({
  title,
  prompt,
  onClick,
  className = "",
}: {
  title: string;
  prompt: string;
  onClick: (prompt: string) => void;
  className?: string;
}) => {
  return (
    <button
      onClick={() => onClick(prompt)}
      className={`p-3 text-sm bg-muted hover:bg-muted/80 rounded-lg transition-colors ${className}`}
    >
      {title}
    </button>
  );
};

// Add this new component for rendering tool calls
const ToolCall = ({
  name,
  params,
  result,
}: {
  name: string;
  params: any;
  result: string;
}) => {
  return (
    <div className="border border-border rounded-md overflow-hidden mb-2">
      <div className="bg-muted/50 px-3 py-2 border-b border-border flex items-center">
        <span className="text-xs font-mono">tool: {name}</span>
      </div>
      <div className="p-3 text-sm space-y-2">
        <div>
          <p className="text-xs text-muted-foreground mb-1">parameters:</p>
          <pre className="bg-background/50 p-2 rounded text-xs overflow-x-auto">
            {JSON.stringify(params, null, 2)}
          </pre>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">result:</p>
          <pre className="bg-background/50 p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap">
            {result}
          </pre>
        </div>
      </div>
    </div>
  );
};

// Update the Message type to include tool calls and results
type MessageWithTools = Message & {
  toolCalls?: Array<{
    id: string;
    name: string;
    params: any;
    result?: string;
  }>;
};

export const Chat = () => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<MessageWithTools[]>([]);
  const { settings, getPreset } = usePipeSettings("hello-world-computer-use");

  const [isMacOS, setIsMacOS] = useState(false);
  const [currentOS, setCurrentOS] = useState("Unknown");

  useEffect(() => {
    const { currentOS, isMacOS, isWindows, isLinux } = detectOS();
    setIsMacOS(isMacOS);
    setCurrentOS(currentOS);
  }, []);

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>,
    prompt?: string
  ) => {
    e.preventDefault();

    // Add the user message immediately
    console.log("input", input);
    const userMessage = {
      id: Date.now().toString(),
      role: "user" as const,
      content: prompt || input,
    };
    console.log("userMessage", userMessage);

    setMessages((prev) => [...prev, userMessage]);
    setInput(""); // Clear input after sending

    // Create AI message placeholder with empty toolCalls array
    const aiMessage: MessageWithTools = {
      id: (Date.now() + 1).toString(),
      role: "assistant" as const,
      content: "",
      toolCalls: [],
    };
    setMessages((prev) => [...prev, aiMessage]);

    const preset = getPreset();
    console.log("preset", preset);

    if (!preset) {
      toast.message("please create new or select existing ones");
      return;
    }

    let apiKey = "";
    if (preset.provider === "openai" || preset.provider === "custom") {
      preset.apiKey;
      if ("apiKey" in preset) {
        apiKey = preset.apiKey;
      } else {
        toast.message("e");
        return;
      }
    }

    const model =
      preset.provider === "openai"
        ? createOpenAI({
            apiKey: apiKey,
          })(preset.model)
        : preset.provider === "native-ollama"
        ? ollama(preset.model)
        : createOpenAI({
            apiKey: apiKey,
          })(preset.model);

    console.log("model", model);
    const messages = [
      {
        id: "1",
        role: "user",
        content: prompt || input,
      },
    ];

    // Combine tools based on OS
    const availableTools = isMacOS
      ? { ...crossPlatformTools, ...macOSTools }
      : crossPlatformTools;

    const result = streamText({
      model,
      // @ts-ignore
      messages: convertToCoreMessages(messages),
      system: `You are an assistant that helps the user interact with the desktop computer using screenpipe.
      If a tool returns no result or fails, you should try again with different parameters.

      ${
        !isMacOS
          ? `You are running on ${currentOS}, which only supports basic pixel-level control operations. Use pixel_type, pixel_press, pixel_move_mouse, and pixel_click to interact with the system.`
          : `You are running on MacOS, which supports both pixel-level controls and accessibility-based element targeting.`
      }

      ${
        isMacOS
          ? `
      Make sure to understand the difference between role and id:
      - role is the role of the element (e.g. button, input, or MacOS Accessibility roles such as AXButton, AXTextField, AXCheckbox, etc.)
      - id is the id of the element (e.g. 1234567890)

      // Some examples of how to map generic roles to MacOS Accessibility roles:
      fn map_generic_role_to_macos_roles(role: &str) -> Vec<String> {
          match role.to_lowercase().as_str() {
              "window" => vec!["AXWindow".to_string()],
              "button" => vec![
                  "AXButton".to_string(),
                  "AXMenuItem".to_string(),
                  "AXMenuBarItem".to_string(),
                  "AXStaticText".to_string(), // Some text might be clickable buttons
                  "AXImage".to_string(),      // Some images might be clickable buttons
              ], // Button can be any of these
              "checkbox" => vec!["AXCheckBox".to_string()],
              "menu" => vec!["AXMenu".to_string()],
              "menuitem" => vec!["AXMenuItem".to_string(), "AXMenuBarItem".to_string()], // Include both types
              "dialog" => vec!["AXSheet".to_string(), "AXDialog".to_string()], // macOS often uses Sheet or Dialog
              "text" | "textfield" | "input" | "textbox" => vec![
                  "AXTextField".to_string(),
                  "AXTextArea".to_string(),
                  "AXText".to_string(),
                  "AXComboBox".to_string(),
                  "AXTextEdit".to_string(),
                  "AXSearchField".to_string(),
                  "AXWebArea".to_string(), // Web content might contain inputs
                  "AXGroup".to_string(),   // Twitter uses groups that contain editable content
                  "AXGenericElement".to_string(), // Generic elements that might be inputs
                  "AXURIField".to_string(), // Explicit URL field type
                  "AXAddressField".to_string(), // Another common name for URL fields
                  "AXStaticText".to_string(), // Static text fields
              ],
              // Add specific support for URL fields
              "url" | "urlfield" => vec![
                  "AXTextField".to_string(),    // URL fields are often text fields
                  "AXURIField".to_string(),     // Explicit URL field type
                  "AXAddressField".to_string(), // Another common name for URL fields
              ],
              "list" => vec!["AXList".to_string()],
              "listitem" => vec!["AXCell".to_string()], // List items are often cells in macOS
              "combobox" => vec!["AXPopUpButton".to_string(), "AXComboBox".to_string()],
              "tab" => vec!["AXTabGroup".to_string()],
              "tabitem" => vec!["AXRadioButton".to_string()], // Tab items are sometimes radio buttons
              "toolbar" => vec!["AXToolbar".to_string()],

              _ => vec![role.to_string()], // Keep as-is for unknown roles
          }
      }

      Be as specific as possible when selecting elements by role. If a role does not work, try a different role.`
          : ""
      }`,
      onError: (error) => {
        console.log(JSON.stringify(error, null, 2));
      },
      tools: availableTools,
      toolCallStreaming: true,
      maxSteps: 10,
      maxRetries: 5,
    });

    // const toolCalls = await result.toolCalls;

    // // Track tool calls and results
    // for await (const chunk of toolCalls) {
    //   console.log("Tool call:", chunk);
    //   setMessages((prev) => {
    //     const updatedMessages = [...prev];
    //     const aiMessageIndex = updatedMessages.findIndex(
    //       (msg) => msg.id === aiMessage.id
    //     );

    //     if (aiMessageIndex !== -1) {
    //       if (!updatedMessages[aiMessageIndex].toolCalls) {
    //         updatedMessages[aiMessageIndex].toolCalls = [];
    //       }

    //       // Find if this tool call already exists
    //       const existingToolCallIndex = updatedMessages[
    //         aiMessageIndex
    //       ].toolCalls?.findIndex((tc) => tc.id === chunk.toolCallId);

    //       if (
    //         existingToolCallIndex !== -1 &&
    //         updatedMessages[aiMessageIndex].toolCalls
    //       ) {
    //         // Update existing tool call
    //         updatedMessages[aiMessageIndex].toolCalls[existingToolCallIndex] = {
    //           ...updatedMessages[aiMessageIndex].toolCalls[
    //             existingToolCallIndex
    //           ],
    //           name: chunk.toolName,
    //           params: chunk.args,
    //         };
    //       } else {
    //         // Add new tool call
    //         updatedMessages[aiMessageIndex].toolCalls?.push({
    //           id: chunk.toolCallId,
    //           name: chunk.toolName,
    //           params: chunk.args,
    //         });
    //       }
    //     }

    //     return updatedMessages;
    //   });
    // }

    // const toolResults = await result.toolResults;

    // // Track tool results
    // for await (const chunk of toolResults) {
    //   console.log("Tool result:", chunk);
    //   setMessages((prev) => {
    //     const updatedMessages = [...prev];
    //     const aiMessageIndex = updatedMessages.findIndex(
    //       (msg) => msg.id === aiMessage.id
    //     );

    //     if (
    //       aiMessageIndex !== -1 &&
    //       updatedMessages[aiMessageIndex].toolCalls
    //     ) {
    //       const toolCallIndex = updatedMessages[
    //         aiMessageIndex
    //       ].toolCalls?.findIndex((tc) => tc.id === chunk.toolCallId);

    //       if (
    //         toolCallIndex !== -1 &&
    //         updatedMessages[aiMessageIndex].toolCalls
    //       ) {
    //         updatedMessages[aiMessageIndex].toolCalls[toolCallIndex].result =
    //           typeof chunk.result === "string"
    //             ? chunk.result
    //             : JSON.stringify(chunk.result);
    //       }
    //     }

    //     return updatedMessages;
    //   });
    // }

    // Get text stream
    for await (const chunk of result.textStream) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiMessage.id
            ? { ...msg, content: msg.content + chunk }
            : msg
        )
      );
    }
  };

  // Replace the existing handler functions with a single generic one
  const handleQuickAction = async (prompt: string) => {
    // Set the input
    setInput(prompt);

    // Submit the form programmatically
    // Create a fake form submit event
    const fakeEvent = {
      preventDefault: () => {},
    } as React.FormEvent<HTMLFormElement>;

    // Use setTimeout to allow the input state to update
    setTimeout(() => {
      handleSubmit(fakeEvent, prompt);
    }, 0);
  };

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      <AIPresetsSelector pipeName="hello-world-computer-use" />

      {!isMacOS && (
        <div className="p-3 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded-md mb-4">
          note: this platform ({currentOS}) only supports basic pixel-level
          controls. advanced accessibility features require macos.
        </div>
      )}

      {/* Updated quick action cards section */}
      <div className="mb-4">
        <h3 className="text-sm font-medium mb-2">quick actions</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <QuickActionCard
            title="say hello"
            prompt="type hello"
            onClick={handleQuickAction}
          />
          <QuickActionCard
            title="move mouse left/right"
            prompt="move mouse to 1200, 1000"
            onClick={handleQuickAction}
          />
          {isMacOS && (
            <QuickActionCard
              title="open x.com & say hello"
              prompt="1. open chrome app 2. open x.com in chrome 3. find the first input on the chrome page 4. type hello, check out this amazing tool: 'https://screenpi.pe' 5. press enter"
              onClick={handleQuickAction}
            />
          )}

          {isMacOS && (
            <QuickActionCard
              title="checkout screenpipe docs on safari"
              prompt="1. open safari 2. type docs.screenpi.pe 3. press enter"
              onClick={handleQuickAction}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`p-4 rounded-lg ${
              message.role === "user"
                ? "bg-primary/10 ml-auto"
                : "bg-muted mr-auto"
            }`}
          >
            <p className="text-sm">{message.role === "user" ? "you" : "ai"}</p>
            <p className="mt-1 whitespace-pre-wrap">{message.content}</p>

            {/* Render tool calls */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-2">
                  tool usage:
                </p>
                {message.toolCalls.map((toolCall) => (
                  <ToolCall
                    key={toolCall.id}
                    name={toolCall.name}
                    params={toolCall.params}
                    result={toolCall.result || "waiting for result..."}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          name="prompt"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="type your message..."
          className="flex-1"
        />
        <Button type="submit" size="sm">
          send
        </Button>
      </form>
    </div>
  );
};
