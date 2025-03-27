"use client";

import { useState } from "react";
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

export const Chat = () => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const { settings, getPreset } = usePipeSettings("hello-world-computer-use");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Add the user message immediately
    const userMessage = {
      id: Date.now().toString(),
      role: "user" as const,
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput(""); // Clear input after sending

    // Create AI message placeholder
    const aiMessage = {
      id: (Date.now() + 1).toString(),
      role: "assistant" as const,
      content: "",
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
        content: input,
      },
    ];

    let currentSelectedElement: ElementInfo | null = null;

    const result = streamText({
      model,
      // @ts-ignore
      messages: convertToCoreMessages(messages),
      system: `You are an assistant that help the user use the operator api of screenpipe to interact with desktop computer
      If a tool returns no result or fail you should try again with different parameters.

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

      Be as specific as possible when selecting elements by role. If a role does not work, try a different role.
      
      `,
      // onChunk: (chunk) => {
      //   console.log(chunk);
      // },
      onError: (error) => {
        console.log(JSON.stringify(error, null, 2));
      },
      tools: {
        click: {
          description: "Click an element in an application",
          parameters: z.object({
            app: z.string().describe("The name of the application"),
            id: z.string().optional().describe("Id of the element"),
          }),
          execute: async ({ app, id }) => {
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
          execute: async ({ id, app, value }) => {
            console.log("[tool:fill] params:", {
              id,
              app,
              value,
            });
            try {
              const success = await pipe.operator
                .getById(id, {
                  app,
                  activateApp: true,
                  useBackgroundApps: true,
                })
                .fill(value);
              console.log("[tool:fill] result:", success);
              return success
                ? `Successfully entered text`
                : `Failed to enter text`;
            } catch (error) {
              console.error("[tool:fill] error:", error);
              throw new Error(`Failed to fill text field: ${error}`);
            }
          },
        },

        pixel_type: {
          description:
            "Type text directly without focusing on a specific element",
          parameters: z.object({
            text: z.string().describe("The text to type"),
          }),
          execute: async ({ text }) => {
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
          execute: async ({ key }) => {
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
          execute: async ({ x, y }) => {
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
          execute: async ({ button }) => {
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

        open_application: {
          description: "Open an application",
          parameters: z.object({
            appName: z.string().describe("The name of the application to open"),
          }),
          execute: async ({ appName }) => {
            try {
              console.log("[tool:open_application] params:", {
                appName,
              });
              const success = await pipe.operator.openApplication(appName);
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
          execute: async ({ url, browser }) => {
            try {
              const success = await pipe.operator.openUrl(url, browser);
              return success
                ? `Successfully opened URL '${url}'${
                    browser ? ` in ${browser}` : ""
                  }`
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
              .describe(
                "The application name (e.g., 'Chrome', 'Firefox', 'Arc')"
              ),
            role: z.string().describe("The role to search for"),
            maxResults: z
              .number()
              .optional()
              .describe("Maximum number of elements to return"),
          }),
          execute: async ({ app, role, maxResults }) => {
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
          execute: async ({ app, id, direction, amount }) => {
            console.log("[tool:scroll] params:", {
              app,
              id,
              direction,
              amount,
            });
            try {
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
      },
      toolCallStreaming: true,
      maxSteps: 10,
    });

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

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      <AIPresetsSelector pipeName="hello-world-computer-use" />

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
            <p className="mt-1">{message.content}</p>
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
