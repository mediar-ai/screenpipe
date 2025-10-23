/**
 * Enhanced Search Component with LLM Integration
 * Demonstrates integration of the new video and voice LLM services
 */

"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from './ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/lib/use-toast';
import { Search, Bot, Sparkles, Video, Mic, Clock, Brain } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Types for the enhanced search component
interface UnifiedAnalysisResult {
  insights: {
    confidence: number;
    summary: string;
    recommendations: string[];
    tags: string[];
  };
}

interface SearchResult {
  id: string;
  type: 'video' | 'audio' | 'multimodal';
  timestamp: string;
  relevanceScore: number;
  title: string;
  description: string;
  content: any;
  llmAnalysis?: UnifiedAnalysisResult;
  thumbnail?: string;
}

interface SearchState {
  query: string;
  isSearching: boolean;
  results: SearchResult[];
  llmInsights?: UnifiedAnalysisResult;
  searchTime: number;
  suggestions: string[];
  activeFilters: {
    contentTypes: ('video' | 'audio' | 'text')[];
    timeRange: { start?: Date; end?: Date };
    minConfidence: number;
  };
}

interface EnhancedSearchProps {
  settings?: any;
  onResultSelect?: (result: SearchResult) => void;
}

// Mock LLM service functions for demonstration
const mockAnalyzeForSearch = async (content: any, query: string): Promise<UnifiedAnalysisResult> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return {
    insights: {
      confidence: 0.78 + Math.random() * 0.2,
      summary: `AI analysis found relevant content for "${query}". The search identified key patterns and contextual information across your recorded data.`,
      recommendations: [
        "Review the highlighted segments for detailed insights",
        "Consider expanding your search with related keywords",
        "Check the timeline view for temporal context"
      ],
      tags: ["ai-analyzed", "high-relevance", query.toLowerCase().replace(/\s+/g, '-')]
    }
  };
};

const mockAnalyzeMultimodal = async (content: any, query: string): Promise<UnifiedAnalysisResult> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1200));
  
  return {
    insights: {
      confidence: 0.85 + Math.random() * 0.15,
      summary: `Multimodal analysis detected synchronized audio-visual patterns for "${query}". Both screen content and voice data provide contextual clues.`,
      recommendations: [
        "Cross-reference video timestamps with audio transcripts",
        "Focus on moments where visual and audio content align",
        "Review speaker identification for meeting contexts"
      ],
      tags: ["multimodal", "synchronized", "comprehensive-analysis"]
    }
  };
};

interface EnhancedSearchProps {
  settings?: any;
  onResultSelect?: (result: SearchResult) => void;
}

interface SearchResult {
  id: string;
  type: 'video' | 'audio' | 'multimodal';
  timestamp: string;
  relevanceScore: number;
  title: string;
  description: string;
  content: any;
  llmAnalysis?: UnifiedAnalysisResult;
  thumbnail?: string;
}

interface SearchState {
  query: string;
  isSearching: boolean;
  results: SearchResult[];
  llmInsights?: UnifiedAnalysisResult;
  searchTime: number;
  suggestions: string[];
  activeFilters: {
    contentTypes: ('video' | 'audio' | 'text')[];
    timeRange: { start?: Date; end?: Date };
    minConfidence: number;
  };
}

export function EnhancedSearchWithLLM({ settings, onResultSelect }: EnhancedSearchProps) {
  const { toast } = useToast();
  const [searchState, setSearchState] = useState<SearchState>({
    query: '',
    isSearching: false,
    results: [],
    searchTime: 0,
    suggestions: [],
    activeFilters: {
      contentTypes: ['video', 'audio', 'text'],
      timeRange: {},
      minConfidence: 0.5
    }
  });

  const [analysisMode, setAnalysisMode] = useState<'smart' | 'multimodal' | 'basic'>('smart');
  const [showInsights, setShowInsights] = useState(true);

  // Load smart suggestions on component mount
  useEffect(() => {
    loadSmartSuggestions();
  }, []);

  const loadSmartSuggestions = useCallback(async () => {
    try {
      // This would typically analyze recent user activity to generate suggestions
      const suggestions = [
        "meetings from last week",
        "when I was coding the search feature",
        "video calls with the team",
        "presentations I worked on",
        "debugging sessions",
        "brainstorming moments"
      ];
      
      setSearchState((prev: SearchState) => ({ ...prev, suggestions }));
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    }
  }, []);

  const performEnhancedSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;

    setSearchState((prev: SearchState) => ({ 
      ...prev, 
      isSearching: true, 
      query,
      results: [],
      llmInsights: undefined 
    }));

    const startTime = Date.now();

    try {
      // Step 1: Get basic search results from Screenpipe
      const basicResults = await performBasicSearch(query);
      
      // Step 2: Enhance results with LLM analysis
      const enhancedResults = await enhanceWithLLM(basicResults, query);
      
      // Step 3: Get LLM insights
      const insights = await generateSearchInsights(enhancedResults, query);
      
      const searchTime = Date.now() - startTime;

      setSearchState((prev: SearchState) => ({
        ...prev,
        isSearching: false,
        results: enhancedResults,
        llmInsights: insights,
        searchTime
      }));

      toast({
        title: "Enhanced Search Complete",
        description: `Found ${enhancedResults.length} results in ${searchTime}ms with LLM analysis`,
      });

    } catch (error) {
      console.error('Enhanced search failed:', error);
      setSearchState((prev: SearchState) => ({ ...prev, isSearching: false }));
      toast({
        title: "Search Failed",
        description: "Please try again",
        variant: "destructive"
      });
    }
  }, [analysisMode, searchState.activeFilters, toast]);

  const performBasicSearch = async (query: string): Promise<any[]> => {
    // This would integrate with the existing Screenpipe search API
    // For demonstration, returning mock data
    return [
      {
        id: '1',
        type: 'video',
        timestamp: new Date().toISOString(),
        content: {
          frameData: 'base64_frame_data_here',
          ocrText: 'Sample OCR text from screen',
          appName: 'VS Code',
          windowName: 'search-component.tsx'
        }
      },
      {
        id: '2',
        type: 'audio',
        timestamp: new Date().toISOString(),
        content: {
          transcript: 'We need to implement the LLM search functionality',
          speaker: { id: '1', name: 'John Doe' }
        }
      }
    ];
  };

  const enhanceWithLLM = async (basicResults: any[], query: string): Promise<SearchResult[]> => {
    const enhanced: SearchResult[] = [];

    for (const result of basicResults) {
      try {
        let llmAnalysis;
        
        if (analysisMode === 'multimodal') {
          // Use multimodal analysis for comprehensive understanding
          llmAnalysis = await mockAnalyzeMultimodal({
            video: result.type === 'video' ? { frames: [result.content] } : undefined,
            audio: result.type === 'audio' ? { transcripts: [result.content] } : undefined
          }, query);
        } else if (analysisMode === 'smart') {
          // Use targeted analysis based on content type
          llmAnalysis = await mockAnalyzeForSearch({
            [result.type]: result.type === 'video' 
              ? { frames: [result.content] } 
              : { transcripts: [result.content] }
          }, query);
        }

        const enhancedResult: SearchResult = {
          id: result.id,
          type: result.type,
          timestamp: result.timestamp,
          relevanceScore: llmAnalysis?.insights?.confidence || 0.5,
          title: generateResultTitle(result, llmAnalysis),
          description: generateResultDescription(result, llmAnalysis),
          content: result.content,
          llmAnalysis,
          thumbnail: result.type === 'video' ? result.content.frameData : undefined
        };

        enhanced.push(enhancedResult);
      } catch (error) {
        console.error(`Failed to enhance result ${result.id}:`, error);
        // Fall back to basic result
        enhanced.push({
          id: result.id,
          type: result.type,
          timestamp: result.timestamp,
          relevanceScore: 0.3,
          title: `${result.type} content`,
          description: 'Basic search result',
          content: result.content
        });
      }
    }

    // Sort by relevance score
    return enhanced.sort((a, b) => b.relevanceScore - a.relevanceScore);
  };

  const generateSearchInsights = async (results: SearchResult[], query: string): Promise<UnifiedAnalysisResult | undefined> => {
    try {
      const content = {
        video: { frames: results.filter(r => r.type === 'video').map(r => r.content) },
        audio: { transcripts: results.filter(r => r.type === 'audio').map(r => r.content) }
      };

      return await mockAnalyzeForSearch(content, query);
    } catch (error) {
      console.error('Failed to generate insights:', error);
      return undefined;
    }
  };

  const generateResultTitle = (result: any, analysis?: UnifiedAnalysisResult): string => {
    if (analysis?.insights?.summary) {
      return analysis.insights.summary.split('.')[0] || 'Enhanced Result';
    }
    
    if (result.type === 'video' && result.content.appName) {
      return `${result.content.appName} Activity`;
    }
    
    if (result.type === 'audio' && result.content.transcript) {
      return result.content.transcript.slice(0, 50) + '...';
    }
    
    return `${result.type} Content`;
  };

  const generateResultDescription = (result: any, analysis?: UnifiedAnalysisResult): string => {
    if (analysis?.insights?.recommendations && analysis.insights.recommendations.length > 0) {
      return analysis.insights.recommendations[0];
    }
    
    if (result.type === 'video') {
      return result.content.ocrText?.slice(0, 100) + '...' || 'Visual content';
    }
    
    if (result.type === 'audio') {
      return result.content.transcript?.slice(0, 100) + '...' || 'Audio content';
    }
    
    return 'Search result';
  };

  const handleResultClick = (result: SearchResult) => {
    onResultSelect?.(result);
    
    // Show detailed analysis in a modal or expand inline
    toast({
      title: `${result.type} Result Selected`,
      description: `Relevance: ${(result.relevanceScore * 100).toFixed(1)}%`,
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Enhanced Search Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-500" />
            Enhanced Search with LLM
            <Badge variant="outline" className="ml-auto">
              {analysisMode}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search with AI-powered understanding..."
                value={searchState.query}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchState((prev: SearchState) => ({ ...prev, query: e.target.value }))}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && performEnhancedSearch(searchState.query)}
                className="pl-10"
              />
            </div>
            <Button 
              onClick={() => performEnhancedSearch(searchState.query)}
              disabled={searchState.isSearching || !searchState.query.trim()}
            >
              {searchState.isSearching ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Analyzing...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Search
                </div>
              )}
            </Button>
          </div>

          {/* Analysis Mode Selection */}
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Analysis Mode:</label>
            <div className="flex gap-2">
              {(['basic', 'smart', 'multimodal'] as const).map((mode) => (
                <Button
                  key={mode}
                  variant={analysisMode === mode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAnalysisMode(mode)}
                >
                  {mode === 'basic' && <Search className="h-3 w-3 mr-1" />}
                  {mode === 'smart' && <Bot className="h-3 w-3 mr-1" />}
                  {mode === 'multimodal' && <Brain className="h-3 w-3 mr-1" />}
                  {mode}
                </Button>
              ))}
            </div>
          </div>

          {/* Smart Suggestions */}
          {searchState.suggestions.length > 0 && !searchState.query && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Smart Suggestions:</label>
              <div className="flex flex-wrap gap-2">
                {searchState.suggestions.map((suggestion: string, index: number) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    onClick={() => performEnhancedSearch(suggestion)}
                    className="text-xs"
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search Progress */}
      {searchState.isSearching && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Analyzing content with LLM...</span>
                <span>Processing</span>
              </div>
              <Progress value={undefined} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* LLM Insights */}
      {searchState.llmInsights && showInsights && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <Brain className="h-4 w-4" />
              AI Insights
              <Badge variant="secondary" className="ml-auto">
                {(searchState.llmInsights.insights.confidence * 100).toFixed(0)}% confidence
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-blue-600">
              {searchState.llmInsights.insights.summary}
            </p>
            
            {searchState.llmInsights.insights.recommendations.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-xs font-medium text-blue-700">Recommendations:</h4>
                <ul className="space-y-1">
                  {searchState.llmInsights.insights.recommendations.map((rec, index) => (
                    <li key={index} className="text-xs text-blue-600 flex items-start gap-1">
                      <span className="mt-1 block w-1 h-1 bg-blue-400 rounded-full" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {searchState.llmInsights.insights.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {searchState.llmInsights.insights.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      {searchState.results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">
              Enhanced Results ({searchState.results.length})
            </h3>
            <Badge variant="outline">
              {searchState.searchTime}ms
            </Badge>
          </div>

          <div className="space-y-3">
            <AnimatePresence>
              {searchState.results.map((result, index) => (
                <motion.div
                  key={result.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card 
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => handleResultClick(result)}
                  >
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        {/* Result Icon/Thumbnail */}
                        <div className="flex-shrink-0">
                          {result.type === 'video' ? (
                            result.thumbnail ? (
                              <img 
                                src={`data:image/jpeg;base64,${result.thumbnail}`}
                                alt="Thumbnail"
                                className="w-12 h-12 rounded object-cover"
                              />
                            ) : (
                              <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
                                <Video className="h-6 w-6 text-gray-400" />
                              </div>
                            )
                          ) : (
                            <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
                              <Mic className="h-6 w-6 text-gray-400" />
                            </div>
                          )}
                        </div>

                        {/* Result Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-medium text-sm truncate">
                              {result.title}
                            </h4>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Badge 
                                variant={result.relevanceScore > 0.7 ? "default" : "secondary"}
                                className="text-xs"
                              >
                                {(result.relevanceScore * 100).toFixed(0)}%
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {result.type}
                              </Badge>
                            </div>
                          </div>
                          
                          <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                            {result.description}
                          </p>

                          <div className="flex items-center gap-2 mt-2">
                            <Clock className="h-3 w-3 text-gray-400" />
                            <span className="text-xs text-gray-500">
                              {new Date(result.timestamp).toLocaleString()}
                            </span>
                            
                            {result.llmAnalysis && (
                              <Badge variant="secondary" className="text-xs ml-auto">
                                <Brain className="h-3 w-3 mr-1" />
                                LLM Enhanced
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!searchState.isSearching && searchState.results.length === 0 && searchState.query && (
        <Card>
          <CardContent className="py-8 text-center">
            <Search className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-500 mb-2">No results found</h3>
            <p className="text-sm text-gray-400">
              Try adjusting your search query or analysis mode
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default EnhancedSearchWithLLM;