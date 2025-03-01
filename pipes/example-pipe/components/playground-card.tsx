"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeBlock } from "./ui/codeblock";
import { parseHtmlContent } from '../lib/html-content-parser';
import { Copy, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

// Import the JSON data
import healthStatusCardData from '../content/health-status-card.json';

// Create a component registry that will be properly typed
const COMPONENT_REGISTRY: Record<string, any> = {};

// Define the content interface
interface PlaygroundCardContent {
  componentPath: string;
  endpoint_optional?: string;
  llmModel: string;
  llmUserPrompt: string;
  llmContextUrl: string;
  title?: string; // Optional title for the card
}

// Update component to accept content as props
export function PlaygroundCard({ content }: { content: PlaygroundCardContent }) {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawOutput, setRawOutput] = useState<string | null>(null);
  const [componentCode, setComponentCode] = useState<string>("");
  const [apiDocs, setApiDocs] = useState<string>("");
  const [requestTime, setRequestTime] = useState<number | null>(null);
  const [responseStatus, setResponseStatus] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string | null>(null);
  const [copiedButton, setCopiedButton] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [componentModule, setComponentModule] = useState<any>(null);
  
  // Destructure content props
  const { 
    componentPath, 
    endpoint_optional, 
    llmModel, 
    llmUserPrompt, 
    llmContextUrl,
    title
  } = content;
  
  // Dynamically load the component based on the path
  useEffect(() => {
    const loadComponent = async () => {
      try {
        setLoading(true);
        
        // Extract the component name from the path
        // For example, from "/pipes/example-pipe/components/ready-to-use-examples/health-status.tsx"
        // we extract "health-status"
        const pathParts = componentPath.split('/');
        const fileName = pathParts[pathParts.length - 1].replace('.tsx', '');
        
        // Dynamically import the component
        const importedModule = await import(`./ready-to-use-examples/${fileName}`);
        
        // Store the module in state
        setComponentModule(importedModule);
        setLoading(false);
      } catch (err) {
        console.error("Error loading component:", err);
        setError(err instanceof Error ? err.message : "Unknown error loading component");
        setLoading(false);
      }
    };
    
    // If the component is already in the registry, use it
    if (COMPONENT_REGISTRY[componentPath]) {
      setComponentModule(COMPONENT_REGISTRY[componentPath]);
      setLoading(false);
    } else {
      loadComponent();
    }
  }, [componentPath]);

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
  }, [llmContextUrl]);

  // Fetch the component source code
  useEffect(() => {
    const fetchComponentSource = async () => {
      try {
        console.log("fetching component source code...");
        
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
  }, [componentPath]);

  // Utility function to format API call results into raw output
  const formatRawOutput = (
    endpoint: string | undefined,
    data: any | null, 
    error: string | null, 
    metadata: { 
      requestTime?: number, 
      status?: number | string, 
      contentType?: string,
      method?: string
    } = {}
  ) => {
    const { requestTime, status, contentType, method = "GET" } = metadata;
    
    // Create header information
    const timeInfo = requestTime ? `> Request completed in ${requestTime.toFixed(2)}ms` : "";
    const statusInfo = status ? `> Status: ${status}` : "";
    const contentTypeInfo = contentType ? `> Content-Type: ${contentType}` : "";
    
    if (error) {
      return `> ${method} ${endpoint || '[No endpoint specified]'}
> Error: ${error}`;
    }
    
    return `> ${method} ${endpoint || '[No endpoint specified]'}
${timeInfo}
${statusInfo}
${contentTypeInfo}

${data ? JSON.stringify(data, null, 2) : "No data returned"}`;
  };

  // Handle data changes
  const handleDataChange = (data: any, errorMsg: string | null) => {
    console.log("data changed:", data ? "data received" : "no data", "error:", errorMsg);
    
    // Only update state if the data is different to prevent infinite loops
    if (data && JSON.stringify(data) !== JSON.stringify(health)) {
      setHealth(data);
      
      // Use the generalized formatter
      setRawOutput(formatRawOutput(
        endpoint_optional, 
        data, 
        null, 
        { 
          requestTime: requestTime ?? undefined, 
          status: responseStatus ?? undefined, 
          contentType: contentType ?? undefined 
        }
      ));
    } else if (errorMsg && errorMsg !== error) {
      setError(errorMsg);
      setRawOutput(formatRawOutput(endpoint_optional, null, errorMsg));
    }
  };

  // For other API calls, you can use the same formatter
  const handleOtherApiCall = (endpoint: string, method = "GET") => {
    // Example of using the formatter with another API call
    const startTime = performance.now();
    fetch(endpoint)
      .then(async (response) => {
        const data = await response.json();
        const requestTime = performance.now() - startTime;
        setRawOutput(formatRawOutput(
          endpoint,
          data,
          null,
          {
            requestTime,
            status: response.status,
            contentType: response.headers.get("content-type") || undefined,
            method
          }
        ));
        // Process data...
      })
      .catch(err => {
        setRawOutput(formatRawOutput(endpoint, null, err.message, { method }));
        // Handle error...
      });
  };

  // Use the llmContext from API docs or fallback
  const llmContext = apiDocs || `Loading reference documentation... See docs at ${llmContextUrl}`;

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

  // Get the component from the module
  const DynamicComponent = componentModule ? 
    // Try different naming conventions to find the component
    componentModule.default || 
    getComponentFromModule(componentModule, componentPath) : 
    null;

  // Helper function to extract component from module based on naming conventions
  function getComponentFromModule(module: any, path: string) {
    const pathParts = path.split('/');
    const fileName = pathParts[pathParts.length - 1].replace('.tsx', '');
    
    // Try camelCase (first letter lowercase)
    const camelCaseName = fileName.split('-').map((part, i) => 
      i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
    ).join('');
    
    // Try PascalCase (all first letters uppercase)
    const pascalCaseName = fileName.split('-').map(part => 
      part.charAt(0).toUpperCase() + part.slice(1)
    ).join('');
    
    return module[camelCaseName] || module[pascalCaseName];
  }

  return (
    <div className="w-full max-w-4xl space-y-4">
      {/* Component Showcase */}
      <Card className="border-2 border-slate-300 bg-slate-50 shadow-md dark:bg-slate-900 dark:border-slate-700">
        <CardHeader 
          className="flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer py-2"
          onClick={() => {
            console.log("toggling component collapse state:", !isCollapsed);
            setIsCollapsed(!isCollapsed);
          }}
        >
          <CardTitle className="text-lg font-mono font-medium">{title}</CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 w-6 p-0" 
            aria-label={isCollapsed ? "expand component" : "collapse component"}
            tabIndex={-1} // Prevents independent focus from the header
            onClick={(e) => e.stopPropagation()} // Prevents double-triggering
          >
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </Button>
        </CardHeader>
        {!isCollapsed && (
          <CardContent className="p-2">
            <Tabs defaultValue="rendered" orientation="vertical" className="flex">
              <TabsList className="mr-4 h-auto flex-col space-y-1 bg-slate-200 dark:bg-slate-800 p-2 rounded-md self-start w-40">
                <TabsTrigger value="rendered" className="justify-start font-mono text-xs w-full text-left">rendered output</TabsTrigger>
                <TabsTrigger value="raw" className="justify-start font-mono text-xs w-full text-left">raw output</TabsTrigger>
                <TabsTrigger value="code" className="justify-start font-mono text-xs w-full text-left">full code</TabsTrigger>
                <TabsTrigger value="prompt" className="justify-start font-mono text-xs w-full text-left">llm prompt</TabsTrigger>
              </TabsList>
              
              <div className="flex-1 relative">
                <TabsContent value="prompt" className="p-3 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md mt-0 absolute inset-0 overflow-auto h-[350px]">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center mb-1">
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
                        <div className="flex-1 bg-slate-50 p-2 rounded-md">
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
                      <div className="flex justify-between items-center mb-1">
                        <h3 className="text-sm font-semibold">
                          context: 
                          <span className="text-xs text-gray-500 block mt-1">{llmContextUrl}</span>
                        </h3>
                      </div>
                      <div className="text-xs max-h-40 overflow-y-auto p-2 bg-slate-50 rounded break-words whitespace-pre-wrap relative">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 w-6 p-0 absolute top-1 right-1 bg-slate-100/80 hover:bg-slate-200/90 z-10" 
                          onClick={() => copyToClipboard(llmContext, "context")}
                        >
                          {copiedButton === "context" ? (
                            <span className="text-green-500">copied!</span>
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        {llmContext}
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="code" className="mt-0 absolute inset-0 overflow-auto h-[350px]">
                  <div className="p-3 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md h-full">
                    {componentCode ? (
                      <div className="text-[12px] [&_*]:text-[12px]">
                        <CodeBlock language="tsx" value={componentCode} />
                      </div>
                    ) : (
                      <div className="animate-pulse text-sm text-slate-500">loading component code...</div>
                    )}
                  </div>
                </TabsContent>
                
                <TabsContent value="raw" className="mt-0 absolute inset-0 overflow-auto h-[350px]">
                  {rawOutput ? (
                    <div className="p-3 bg-black text-green-400 font-mono rounded-md h-full border border-green-700">
                      <pre className="text-sm font-mono">{rawOutput}</pre>
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md h-full">
                      <p className="text-sm text-slate-500 font-mono">click to see raw output</p>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="rendered" className="mt-0 absolute inset-0 overflow-auto h-[350px]">
                  <div className="border border-slate-300 dark:border-slate-700 rounded-md p-3 h-full bg-white dark:bg-slate-950">
                    {loading ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="animate-pulse text-sm text-slate-500">Loading component...</div>
                      </div>
                    ) : DynamicComponent ? (
                      <DynamicComponent onDataChange={handleDataChange} />
                    ) : (
                      <div className="text-sm text-slate-500">
                        No component found for path: {componentPath}
                      </div>
                    )}
                  </div>
                </TabsContent>
                
                {/* Add an invisible spacer div to maintain consistent height */}
                <div className="invisible h-[350px]"></div>
              </div>
            </Tabs>
          </CardContent>
        )}
      </Card>
    </div>
  );
}