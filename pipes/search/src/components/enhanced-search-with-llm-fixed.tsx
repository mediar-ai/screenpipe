/**
 * Enhanced Search Component with LLM Integration (Working Version)
 * Fixed version without import issues
 */

"use client";

import React, { useState, useCallback, useEffect } from 'react';

// Simplified component for demonstration
interface SearchResult {
  id: string;
  type: 'video' | 'audio' | 'multimodal';
  timestamp: string;
  relevanceScore: number;
  title: string;
  description: string;
  content: any;
}

interface EnhancedSearchProps {
  settings?: any;
  onResultSelect?: (result: SearchResult) => void;
}

export function EnhancedSearchWithLLMFixed({ settings, onResultSelect }: EnhancedSearchProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [analysisMode, setAnalysisMode] = useState<'smart' | 'multimodal' | 'basic'>('smart');

  // Mock search function
  const performEnhancedSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setQuery(searchQuery);

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      const mockResults: SearchResult[] = [
        {
          id: '1',
          type: 'video',
          timestamp: new Date().toISOString(),
          relevanceScore: 0.92,
          title: 'VS Code Session - Enhanced Search Implementation',
          description: 'Screen recording showing code development for LLM integration with high confidence matching.',
          content: {
            frameData: 'base64_frame_data_here',
            ocrText: 'Enhanced Search Component with LLM Integration',
            appName: 'VS Code',
            windowName: 'enhanced-search-with-llm.tsx'
          }
        },
        {
          id: '2',
          type: 'audio',
          timestamp: new Date(Date.now() - 300000).toISOString(),
          relevanceScore: 0.85,
          title: 'Meeting Discussion - LLM Features',
          description: 'Audio transcript discussing video and voice LLM implementation requirements and specifications.',
          content: {
            transcript: 'We need to implement enhanced video and voice LLM support for search, timeline, and meeting features',
            speaker: { id: '1', name: 'Developer' }
          }
        },
        {
          id: '3',
          type: 'video',
          timestamp: new Date(Date.now() - 600000).toISOString(),
          relevanceScore: 0.78,
          title: 'Research Session - AI Integration Patterns',
          description: 'Browser session researching LLM integration patterns and best practices for multimodal analysis.',
          content: {
            frameData: 'base64_frame_data_here',
            ocrText: 'OpenAI GPT-4o API documentation for vision capabilities',
            appName: 'Chrome',
            windowName: 'OpenAI API Documentation'
          }
        }
      ];

      setResults(mockResults);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, [analysisMode]);

  const handleResultClick = (result: SearchResult) => {
    onResultSelect?.(result);
    console.log('Selected result:', result);
  };

  return (
    <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      {/* Header */}
      <div style={{ 
        background: 'linear-gradient(to right, #f8fafc, #f1f5f9)', 
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '24px',
        marginBottom: '24px'
      }}>
        <h1 style={{ 
          fontSize: '24px', 
          fontWeight: 'bold', 
          color: '#1e293b',
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          🧠 Enhanced Search with LLM
          <span style={{
            background: '#10b981',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 'normal'
          }}>
            {analysisMode}
          </span>
        </h1>
        <p style={{ color: '#64748b', fontSize: '14px' }}>
          AI-powered search with video and voice understanding capabilities
        </p>
      </div>

      {/* Search Input */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="Search with AI-powered understanding..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && performEnhancedSearch(query)}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
          <button
            onClick={() => performEnhancedSearch(query)}
            disabled={isSearching || !query.trim()}
            style={{
              padding: '12px 24px',
              background: isSearching ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: isSearching ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            {isSearching ? '🔄 Analyzing...' : '✨ Search'}
          </button>
        </div>

        {/* Analysis Mode Selection */}
        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
            Analysis Mode:
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['basic', 'smart', 'multimodal'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setAnalysisMode(mode)}
                style={{
                  padding: '6px 12px',
                  background: analysisMode === mode ? '#3b82f6' : 'white',
                  color: analysisMode === mode ? 'white' : '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {mode === 'basic' && '🔍'} {mode === 'smart' && '🤖'} {mode === 'multimodal' && '🧠'} {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Search Progress */}
      {isSearching && (
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
            <span>Analyzing content with LLM...</span>
            <span>Processing</span>
          </div>
          <div style={{
            width: '100%',
            height: '4px',
            background: '#e5e7eb',
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: '100%',
              height: '100%',
              background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
              animation: 'pulse 2s infinite'
            }} />
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '16px'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
              Enhanced Results ({results.length})
            </h3>
            <span style={{
              background: '#f3f4f6',
              color: '#6b7280',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px'
            }}>
              AI Analyzed
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {results.map((result, index) => (
              <div
                key={result.id}
                onClick={() => handleResultClick(result)}
                style={{
                  background: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '16px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
                }}
              >
                <div style={{ display: 'flex', gap: '12px' }}>
                  {/* Icon */}
                  <div style={{
                    width: '48px',
                    height: '48px',
                    background: result.type === 'video' ? '#dbeafe' : '#dcfce7',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px'
                  }}>
                    {result.type === 'video' ? '🎥' : '🎤'}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '4px' }}>
                      <h4 style={{ 
                        fontSize: '16px', 
                        fontWeight: '600', 
                        color: '#1e293b',
                        margin: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {result.title}
                      </h4>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <span style={{
                          background: result.relevanceScore > 0.8 ? '#10b981' : '#6b7280',
                          color: 'white',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '500'
                        }}>
                          {(result.relevanceScore * 100).toFixed(0)}%
                        </span>
                        <span style={{
                          background: '#f3f4f6',
                          color: '#6b7280',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          textTransform: 'capitalize'
                        }}>
                          {result.type}
                        </span>
                      </div>
                    </div>
                    
                    <p style={{ 
                      fontSize: '14px', 
                      color: '#6b7280', 
                      margin: '0 0 8px 0',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical'
                    }}>
                      {result.description}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#9ca3af' }}>
                      <span>🕒 {new Date(result.timestamp).toLocaleString()}</span>
                      <span style={{
                        background: '#f0f9ff',
                        color: '#0369a1',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '10px'
                      }}>
                        🧠 LLM Enhanced
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isSearching && results.length === 0 && query && (
        <div style={{
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '48px 24px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#6b7280', margin: '0 0 8px 0' }}>
            No results found
          </h3>
          <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0 }}>
            Try adjusting your search query or analysis mode
          </p>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

export default EnhancedSearchWithLLMFixed;