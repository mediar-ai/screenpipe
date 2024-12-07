"use client";

import { useState, useMemo } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Loader2 } from "lucide-react";
import { debounce } from "lodash";

interface TemplateEditorProps {
  initialTemplate: Record<string, any>;
}

export default function TemplateEditor({ initialTemplate }: TemplateEditorProps) {
  const [template, setTemplate] = useState(initialTemplate);
  const [isOpen, setIsOpen] = useState(true);
  const [searchResults, setSearchResults] = useState<number | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleChange = async (key: string, value: string) => {
    console.log(`handleChange called: key=${key}, value=${value}`);
    
    if (key === 'paste_here_url_from_linkedin_with_2nd_grade_connections') {
      console.log('search url field changed');
      if (value.includes('linkedin.com/search')) {
        console.log('Valid LinkedIn search URL detected');
        await validateSearchLink(value);
      } else {
        console.log('Invalid LinkedIn search URL');
      }
    }

    setTemplate(prev => {
      const newTemplate = { ...prev, [key]: value };
      debouncedSave(newTemplate);
      return newTemplate;
    });
  };

  const debouncedSave = useMemo(
    () => debounce(async (template) => {
        try {
            const response = await fetch('/api/save-template', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(template)
            });

            if (!response.ok) {
                throw new Error('failed to save template');
            }

            console.log('template auto-saved');
        } catch (error) {
            console.error('error auto-saving template:', error);
        }
    }, 1000),
    []
  );

  const validateSearchLink = async (url: string) => {
    try {
      setIsValidating(true);
      setValidationError(null);
      console.log('starting search validation...');
      
      // First check Chrome status
      let statusRes = await fetch('/api/chrome/status');
      let { wsUrl, status } = await statusRes.json();
      console.log('initial chrome status:', status, 'wsUrl:', wsUrl);
      
      // If not connected, launch Chrome and wait for connection
      if (status !== 'connected') {
        console.log('chrome not connected, launching...');
        await fetch('/api/chrome', { method: 'POST' });
        
        // Poll for connection status
        for (let i = 0; i < 10; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          statusRes = await fetch('/api/chrome/status');
          const newStatus = await statusRes.json();
          console.log('checking chrome status:', newStatus);
          
          if (newStatus.status === 'connected' && newStatus.wsUrl) {
            wsUrl = newStatus.wsUrl;
            status = newStatus.status;
            break;
          }
        }
        
        if (status !== 'connected' || !wsUrl) {
          throw new Error('failed to connect to chrome after multiple attempts');
        }
      }
      
      console.log('chrome connected, sending validation request with wsUrl:', wsUrl);
      const response = await fetch('/api/validate-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url, 
          wsUrl,
          allowTruncate: searchResults === 100 // true if we've clicked the truncate button
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }

      const { count } = await response.json();
      setSearchResults(count);
      
      // Add warning message for large result sets
      if (count > 100) {
        setValidationError('too many results. please refine your search to less than 100 connections');
        setSearchResults(null);
      } else {
        setValidationError(null);
      }
      
      console.log(`search validated: ${count} results found`);
    } catch (error) {
      console.error('validation failed:', error);
      setSearchResults(null);
      setValidationError(String(error));
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="w-full max-w-7xl flex flex-col gap-6">
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
        <CollapsibleTrigger className="flex items-center gap-2 w-full">
          <h2 className="text-xl font-semibold">LinkedIn automation settings</h2>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "transform rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-6">
          <div className="flex flex-col gap-6">
            <div className="mb-4 text-sm space-y-2">
              <p className="font-medium">Start off by creating your target LinkedIn search:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Go to this link to open all your 2nd grade connections: <a href="https://www.linkedin.com/search/results/people/?network=%5B%22S%22%5D" className="text-blue-600 dark:text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">link</a></li>
                <li>Modify filters as you want, e.g. Locations, Company</li>
                <li>Open All filters to add even more targeted criteria, e.g. industry, keywords, etc.</li>
                <li>When finished copy the url</li>
                <li>Insert it in the field below</li>
              </ol>
              <img src="/guide_bigger.gif" alt="LinkedIn search guide" className="rounded-lg mt-4 w-full max-w-3xl" />
            </div>
            {Object.entries(template).map(([key, value]) => (
              <div key={key} className="flex flex-col gap-2">
                <label className="text-sm font-medium">
                  {key.replace(/_/g, ' ')}
                  {key === 'paste_here_url_from_linkedin_with_2nd_grade_connections' && (
                    <span className="ml-2">
                      {isValidating ? (
                        <span className="text-gray-500 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          validating...
                        </span>
                      ) : searchResults ? (
                        <span className="text-green-600">
                          ✓ {searchResults.toLocaleString()} results found
                        </span>
                      ) : validationError ? (
                        <span className="text-red-500">
                          ⚠ validation failed, please try again
                        </span>
                      ) : null}
                    </span>
                  )}
                </label>
                <textarea
                  className="w-full min-h-[100px] p-4 border rounded-lg font-mono text-sm 
                    bg-white dark:bg-black text-black dark:text-white resize-vertical"
                  value={value}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder={`Enter ${key}...`}
                />
                {key === 'paste_here_url_from_linkedin_with_2nd_grade_connections' && validationError && (
                  <div className="space-y-2">
                    <p className="text-base text-red-500 mt-1">
                      {validationError.replace(/^.*?too many/, 'too many')}
                    </p>
                    <button
                      onClick={() => {
                        setValidationError(null);
                        setSearchResults(100);
                      }}
                      className="px-4 py-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                    >
                      truncate to process only first 100 connections
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
} 