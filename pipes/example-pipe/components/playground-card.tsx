"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeBlock } from "./ui/codeblock";
import { HealthStatus } from "./health-status";
import { parseHtmlContent } from './html-content-parser';
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PlaygroundCard() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawOutput, setRawOutput] = useState<string | null>(null);
  const [componentCode, setComponentCode] = useState<string>("");
  const [apiDocs, setApiDocs] = useState<string>("");
  const [requestTime, setRequestTime] = useState<number | null>(null);
  const [responseStatus, setResponseStatus] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string | null>(null);
  const [copiedButton, setCopiedButton] = useState<string | null>(null);
  
  // Add LLM model information
  const llmModel = "claude-3.7-sonnet";
  
  // API docs URL for reference
  const llmContextUrl = "https://docs.screenpi.pe/docs/api-reference";
  
  // Fetch the component source code
  useEffect(() => {
    const fetchComponentSource = async () => {
      try {
        console.log("fetching component source code...");
        
        // Use the correct path relative to the project structure
        // The path should be relative to where the API route is looking for files
        const componentPath = "/pipes/example-pipe/components/health-status.tsx";
        console.log("attempting to fetch component source with path:", componentPath);
        
        const response = await fetch(
          `/api/component-source?path=${encodeURIComponent(componentPath)}`
        );
        
        console.log("fetch response status:", response.status);
        
        if (!response.ok) {
          throw new Error(`failed to fetch source: ${response.status}`);
        }
        const source = await response.text();
        console.log(
          "component source loaded, length:", 
          source.length, 
          "first 50 chars:", 
          source.substring(0, 50)
        );
        setComponentCode(source);
      } catch (err) {
        console.error("error fetching component source:", err);
        setError(err instanceof Error ? err.message : "unknown error occurred");
        
        // Set a fallback component code so the UI doesn't break completely
        setComponentCode(
          "// Component source could not be loaded\n// Error: " + 
          (err instanceof Error ? err.message : "unknown error")
        );
      }
    };
    
    fetchComponentSource();
  }, []);

  // Fetch API reference documentation
  useEffect(() => {
    const fetchApiDocs = async () => {
      try {
        console.log("fetching api reference documentation...");
        console.log("api docs url:", llmContextUrl);
        
        const response = await fetch(
          `/api/fetch-external?url=${encodeURIComponent(llmContextUrl)}`
        );
        
        console.log("api docs fetch response status:", response.status);
        
        if (!response.ok) {
          throw new Error(`failed to fetch api docs: ${response.status}`);
        }
        
        const content = await response.text();
        console.log("api docs loaded, length:", content.length);
        
        // Parse the HTML content to make it more readable
        const parsedContent = parseHtmlContent(content);
        console.log("parsed api docs, new length:", parsedContent.length);
        
        setApiDocs(parsedContent);
      } catch (err) {
        console.error("error fetching api docs:", err);
        setApiDocs(
          `Failed to load API documentation. Please check the docs at ${llmContextUrl}`
        );
      }
    };
    
    fetchApiDocs();
  }, []);

  // Handle health data changes from the HealthStatus component
  const handleHealthDataChange = (data: any, errorMsg: string | null) => {
    console.log("health data changed:", data ? "data received" : "no data", "error:", errorMsg);
    
    if (data) {
      setHealth(data);
      
      // Create raw CLI-like output
      const timeInfo = requestTime ? `> Request completed in ${requestTime.toFixed(2)}ms` : "";
      const statusInfo = responseStatus ? `> Status: ${responseStatus}` : "";
      const contentTypeInfo = contentType ? `> Content-Type: ${contentType}` : "";
      
      setRawOutput(`> fetch http://localhost:3030/health
${timeInfo}
${statusInfo}
${contentTypeInfo}

${JSON.stringify(data, null, 2)}`);
    } else if (errorMsg) {
      setError(errorMsg);
      setRawOutput(`> fetch http://localhost:3030/health
> Error: ${errorMsg}`);
    }
  };

  // Split the prompt into user prompt and context
  const llmUserPrompt = 
    "Can we have another component to call screenpipe health endpoint and render raw json output? " +
    "can we display the output more user friendly, with some animation (framer motion), etc., keep code short";
  const llmContext = apiDocs || `Loading API reference documentation... See docs at ${llmContextUrl}`;

  // Add these new functions to handle copying text
  const copyToClipboard = (text: string, buttonId: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        console.log("copied text to clipboard:", text.substring(0, 20) + "...");
        setCopiedButton(buttonId);
        
        // Reset the copied state after 2 seconds
        setTimeout(() => {
          setCopiedButton(null);
        }, 2000);
      })
      .catch(err => {
        console.error("failed to copy text:", err);
      });
  };

  const copyEntirePrompt = () => {
    const fullPrompt = `User Prompt: ${llmUserPrompt}\n\nContext:\n${llmContext}`;
    copyToClipboard(fullPrompt, "entire-prompt");
  };

  return (
    <div className="w-full max-w-4xl space-y-6">
      {/* Component Showcase */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium">health status </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="prompt">
            <TabsList className="mb-4">
              <TabsTrigger value="prompt">llm prompt</TabsTrigger>
              <TabsTrigger value="code">code</TabsTrigger>
              <TabsTrigger value="raw">raw output</TabsTrigger>
              <TabsTrigger value="rendered">rendered</TabsTrigger>
            </TabsList>
            
            <TabsContent value="prompt" className="p-4 bg-slate-50 rounded-md">
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">model: {llmModel}</div>
                    <h3 className="text-sm font-semibold">user prompt:</h3>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs h-6 py-0 px-2" 
                    onClick={copyEntirePrompt}
                  >
                    {copiedButton === "entire-prompt" ? (
                      <span className="text-green-500">copied!</span>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 mr-1" /> copy entire prompt
                      </>
                    )}
                  </Button>
                </div>
                <div className="relative">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 bg-slate-100 p-3 rounded-md">
                      <p className="text-sm">{llmUserPrompt}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-xs h-8 py-0 px-2 whitespace-nowrap" 
                      onClick={() => copyToClipboard(llmUserPrompt, "user-prompt")}
                    >
                      {copiedButton === "user-prompt" ? (
                        <span className="text-green-500">copied!</span>
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="relative">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-semibold">
                      context from <a 
                        href={llmContextUrl} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-blue-500 hover:underline"
                      >
                        api reference
                      </a>: 
                      <span className="text-xs text-gray-500 block mt-1">{llmContextUrl}</span>
                    </h3>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 w-6 p-0" 
                      onClick={() => copyToClipboard(llmContext, "context")}
                    >
                      {copiedButton === "context" ? (
                        <span className="text-green-500">copied!</span>
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                  <div className="text-xs max-h-60 overflow-y-auto p-2 bg-slate-100 rounded break-words whitespace-pre-wrap">
                    {llmContext}
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="code">
              <div className="p-4 bg-slate-100 rounded-md overflow-auto">
                {componentCode ? (
                  <CodeBlock language="tsx" value={componentCode} />
                ) : (
                  <div className="animate-pulse text-sm text-slate-500">loading component code...</div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="raw">
              {rawOutput ? (
                <div className="p-4 bg-black text-green-400 rounded-md overflow-auto">
                  <pre className="text-sm font-mono">{rawOutput}</pre>
                </div>
              ) : (
                <div className="p-4 bg-slate-100 rounded-md">
                  <p className="text-sm text-slate-500">click &quot;fetch health data&quot; to see raw output</p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="rendered">
              <div className="border rounded-md p-4">
                <HealthStatus onHealthDataChange={handleHealthDataChange} />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}