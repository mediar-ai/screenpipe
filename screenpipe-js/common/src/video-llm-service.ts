/**
 * Video LLM Service
 * Provides advanced video analysis capabilities using large language models
 * for better frame understanding and content extraction
 */

import { OpenAI } from 'openai';
import type { Settings } from '@screenpipe/browser';

export interface VideoAnalysisRequest {
  frameData: string; // base64 encoded frame
  timestamp: string;
  appName?: string;
  windowName?: string;
  ocrText?: string;
  previousFrames?: string[]; // for context
  analysisType?: 'content' | 'activity' | 'objects' | 'text' | 'full';
}

export interface VideoAnalysisResult {
  description: string;
  activities: string[];
  objects: string[];
  textContent: string[];
  visualCues: string[];
  context: string;
  confidence: number;
  tags: string[];
  embeddings?: number[];
}

export interface VoiceAnalysisRequest {
  transcript: string;
  timestamp: string;
  speaker?: {
    id: string;
    name: string;
  };
  context?: string;
  previousTranscripts?: string[];
  analysisType?: 'summary' | 'sentiment' | 'topics' | 'action_items' | 'full';
}

export interface VoiceAnalysisResult {
  summary: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  topics: string[];
  actionItems: string[];
  emotions: string[];
  speakerInsights: string[];
  context: string;
  confidence: number;
  embeddings?: number[];
}

export interface MultiModalSearchRequest {
  query: string;
  videoFrames?: VideoAnalysisResult[];
  voiceTranscripts?: VoiceAnalysisResult[];
  timeRange?: {
    start: string;
    end: string;
  };
  contextWindow?: number; // minutes of context
}

export interface MultiModalSearchResult {
  matches: Array<{
    type: 'video' | 'audio' | 'combined';
    timestamp: string;
    relevanceScore: number;
    description: string;
    context: string;
    frameData?: string;
    audioData?: string;
  }>;
  totalMatches: number;
  searchTime: number;
}

export class VideoLLMService {
  private openai: OpenAI;
  private settings: Settings;
  private cache: Map<string, any> = new Map();

  constructor(settings: Settings) {
    this.settings = settings;
    this.openai = new OpenAI({
      apiKey: settings?.aiProviderType === "screenpipe-cloud" 
        ? settings?.user?.token 
        : settings?.openaiApiKey,
      baseURL: settings?.aiUrl,
      dangerouslyAllowBrowser: true,
    });
  }

  /**
   * Analyze a video frame with LLM for better content understanding
   */
  async analyzeVideoFrame(request: VideoAnalysisRequest): Promise<VideoAnalysisResult> {
    const cacheKey = `video_${request.timestamp}_${request.analysisType}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const systemPrompt = this.getVideoAnalysisPrompt(request.analysisType || 'full');
      
      const messages = [
        {
          role: "system" as const,
          content: systemPrompt
        },
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: this.buildVideoAnalysisContext(request)
            },
            {
              type: "image_url" as const,
              image_url: {
                url: `data:image/jpeg;base64,${request.frameData}`
              }
            }
          ]
        }
      ];

      if (request.previousFrames && request.previousFrames.length > 0) {
        messages.push({
          role: "user" as const,
          content: `Previous frame context: ${request.previousFrames.join(', ')}`
        });
      }

      const response = await this.openai.chat.completions.create({
        model: this.settings.aiModel || 'gpt-4o',
        messages,
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{}') as VideoAnalysisResult;
      
      // Cache the result for 5 minutes
      this.cache.set(cacheKey, result);
      setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);
      
      return result;
    } catch (error) {
      console.error('Video analysis failed:', error);
      return this.getDefaultVideoResult();
    }
  }

  /**
   * Analyze voice transcript with enhanced LLM understanding
   */
  async analyzeVoiceTranscript(request: VoiceAnalysisRequest): Promise<VoiceAnalysisResult> {
    const cacheKey = `voice_${request.timestamp}_${request.analysisType}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const systemPrompt = this.getVoiceAnalysisPrompt(request.analysisType || 'full');
      
      const messages = [
        {
          role: "system" as const,
          content: systemPrompt
        },
        {
          role: "user" as const,
          content: this.buildVoiceAnalysisContext(request)
        }
      ];

      const response = await this.openai.chat.completions.create({
        model: this.settings.aiModel || 'gpt-4o',
        messages,
        temperature: 0.3,
        max_tokens: 800,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{}') as VoiceAnalysisResult;
      
      // Cache the result for 5 minutes
      this.cache.set(cacheKey, result);
      setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);
      
      return result;
    } catch (error) {
      console.error('Voice analysis failed:', error);
      return this.getDefaultVoiceResult();
    }
  }

  /**
   * Perform multimodal search across video and audio content
   */
  async performMultiModalSearch(request: MultiModalSearchRequest): Promise<MultiModalSearchResult> {
    const startTime = Date.now();
    
    try {
      const searchPrompt = `
You are an advanced multimodal search engine that analyzes both visual and audio content.
Search query: "${request.query}"

Your task is to find the most relevant matches across:
1. Video frames and their visual content
2. Audio transcriptions and their meaning
3. Combined multimodal moments

Return matches ranked by relevance with detailed explanations.
`;

      const messages = [
        {
          role: "system" as const,
          content: searchPrompt
        },
        {
          role: "user" as const,
          content: JSON.stringify({
            query: request.query,
            videoData: request.videoFrames?.slice(0, 20), // Limit for token efficiency
            voiceData: request.voiceTranscripts?.slice(0, 20),
            timeRange: request.timeRange,
            contextWindow: request.contextWindow
          })
        }
      ];

      const response = await this.openai.chat.completions.create({
        model: this.settings.aiModel || 'gpt-4o',
        messages,
        temperature: 0.2,
        max_tokens: 1500,
        response_format: { type: "json_object" }
      });

      const searchResult = JSON.parse(response.choices[0]?.message?.content || '{}') as MultiModalSearchResult;
      searchResult.searchTime = Date.now() - startTime;
      
      return searchResult;
    } catch (error) {
      console.error('Multimodal search failed:', error);
      return {
        matches: [],
        totalMatches: 0,
        searchTime: Date.now() - startTime
      };
    }
  }

  /**
   * Batch analyze multiple frames for efficiency
   */
  async batchAnalyzeFrames(requests: VideoAnalysisRequest[]): Promise<VideoAnalysisResult[]> {
    const batchSize = 5; // Process in smaller batches to avoid token limits
    const results: VideoAnalysisResult[] = [];
    
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const batchPromises = batch.map(request => this.analyzeVideoFrame(request));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push(this.getDefaultVideoResult());
        }
      });
      
      // Add small delay between batches to respect rate limits
      if (i + batchSize < requests.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return results;
  }

  /**
   * Generate enhanced search suggestions based on content analysis
   */
  async generateSmartSuggestions(recentAnalysis: {
    video: VideoAnalysisResult[];
    voice: VoiceAnalysisResult[];
  }): Promise<string[]> {
    try {
      const prompt = `
Based on recent user activity, generate intelligent search suggestions that would help them find relevant moments.

Recent visual content: ${recentAnalysis.video.map(v => v.description).join(', ')}
Recent voice content: ${recentAnalysis.voice.map(v => v.summary).join(', ')}

Generate 8-10 natural search queries that would be useful for finding specific moments.
Format as a JSON array of strings.
`;

      const response = await this.openai.chat.completions.create({
        model: this.settings.aiModel || 'gpt-4o',
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        max_tokens: 400,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{"suggestions": []}');
      return result.suggestions || [];
    } catch (error) {
      console.error('Smart suggestions generation failed:', error);
      return [
        "when I was in a meeting",
        "working on code",
        "browsing the web",
        "watching a video",
        "writing documents"
      ];
    }
  }

  private getVideoAnalysisPrompt(type: string): string {
    const basePrompt = `You are an expert computer vision analyst. Analyze the provided screenshot and extract meaningful information.`;
    
    switch (type) {
      case 'content':
        return `${basePrompt} Focus on identifying the main content, text, and visual elements. Return JSON with: description, textContent, visualCues, confidence.`;
      case 'activity':
        return `${basePrompt} Focus on user activities and interactions. Return JSON with: activities, context, confidence.`;
      case 'objects':
        return `${basePrompt} Focus on identifying objects, UI elements, and visual components. Return JSON with: objects, visualCues, confidence.`;
      case 'text':
        return `${basePrompt} Focus on extracting and understanding text content. Return JSON with: textContent, context, confidence.`;
      default:
        return `${basePrompt} Provide comprehensive analysis including activities, objects, text, and context. Return JSON with all fields: description, activities, objects, textContent, visualCues, context, confidence, tags.`;
    }
  }

  private getVoiceAnalysisPrompt(type: string): string {
    const basePrompt = `You are an expert speech and conversation analyst. Analyze the provided transcript for deeper understanding.`;
    
    switch (type) {
      case 'summary':
        return `${basePrompt} Focus on creating a concise summary. Return JSON with: summary, confidence.`;
      case 'sentiment':
        return `${basePrompt} Focus on emotional tone and sentiment. Return JSON with: sentiment, emotions, confidence.`;
      case 'topics':
        return `${basePrompt} Focus on identifying key topics and themes. Return JSON with: topics, context, confidence.`;
      case 'action_items':
        return `${basePrompt} Focus on extracting action items and decisions. Return JSON with: actionItems, context, confidence.`;
      default:
        return `${basePrompt} Provide comprehensive analysis including summary, sentiment, topics, action items, and speaker insights. Return JSON with all fields: summary, sentiment, topics, actionItems, emotions, speakerInsights, context, confidence.`;
    }
  }

  private buildVideoAnalysisContext(request: VideoAnalysisRequest): string {
    let context = `Analyze this screenshot taken at ${request.timestamp}.`;
    
    if (request.appName) {
      context += ` The active application was ${request.appName}.`;
    }
    
    if (request.windowName) {
      context += ` The window title was "${request.windowName}".`;
    }
    
    if (request.ocrText) {
      context += ` OCR detected text: "${request.ocrText}".`;
    }
    
    context += ` Please provide detailed analysis of the visual content, user activities, and any relevant context.`;
    
    return context;
  }

  private buildVoiceAnalysisContext(request: VoiceAnalysisRequest): string {
    let context = `Analyze this transcript from ${request.timestamp}: "${request.transcript}"`;
    
    if (request.speaker) {
      context += ` Speaker: ${request.speaker.name} (ID: ${request.speaker.id}).`;
    }
    
    if (request.context) {
      context += ` Additional context: ${request.context}.`;
    }
    
    if (request.previousTranscripts && request.previousTranscripts.length > 0) {
      context += ` Previous conversation context: ${request.previousTranscripts.join(' ')}`;
    }
    
    return context;
  }

  private getDefaultVideoResult(): VideoAnalysisResult {
    return {
      description: "Unable to analyze frame",
      activities: [],
      objects: [],
      textContent: [],
      visualCues: [],
      context: "",
      confidence: 0,
      tags: []
    };
  }

  private getDefaultVoiceResult(): VoiceAnalysisResult {
    return {
      summary: "Unable to analyze transcript",
      sentiment: "neutral" as const,
      topics: [],
      actionItems: [],
      emotions: [],
      speakerInsights: [],
      context: "",
      confidence: 0
    };
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Export singleton instance creator
export function createVideoLLMService(settings: Settings): VideoLLMService {
  return new VideoLLMService(settings);
}

// Utility functions for common operations
export async function enhancedFrameSearch(
  frames: Array<{
    timestamp: string;
    frameData: string;
    ocrText?: string;
    appName?: string;
    windowName?: string;
  }>,
  query: string,
  settings: Settings
): Promise<Array<{
  frame: any;
  relevanceScore: number;
  explanation: string;
}>> {
  const service = createVideoLLMService(settings);
  
  // Analyze all frames
  const analysisRequests: VideoAnalysisRequest[] = frames.map(frame => ({
    frameData: frame.frameData,
    timestamp: frame.timestamp,
    appName: frame.appName,
    windowName: frame.windowName,
    ocrText: frame.ocrText,
    analysisType: 'full'
  }));
  
  const analyses = await service.batchAnalyzeFrames(analysisRequests);
  
  // Perform multimodal search
  const searchResult = await service.performMultiModalSearch({
    query,
    videoFrames: analyses
  });
  
  // Combine results
  return searchResult.matches
    .filter(match => match.type === 'video' || match.type === 'combined')
    .map((match, index) => ({
      frame: frames[index],
      relevanceScore: match.relevanceScore,
      explanation: match.description
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

export async function enhancedVoiceSearch(
  transcripts: Array<{
    timestamp: string;
    transcript: string;
    speaker?: { id: string; name: string };
  }>,
  query: string,
  settings: Settings
): Promise<Array<{
  transcript: any;
  relevanceScore: number;
  explanation: string;
}>> {
  const service = createVideoLLMService(settings);
  
  // Analyze all transcripts
  const analysisRequests: VoiceAnalysisRequest[] = transcripts.map(t => ({
    transcript: t.transcript,
    timestamp: t.timestamp,
    speaker: t.speaker,
    analysisType: 'full'
  }));
  
  const analyses = await Promise.all(
    analysisRequests.map(req => service.analyzeVoiceTranscript(req))
  );
  
  // Perform multimodal search
  const searchResult = await service.performMultiModalSearch({
    query,
    voiceTranscripts: analyses
  });
  
  // Combine results
  return searchResult.matches
    .filter(match => match.type === 'audio' || match.type === 'combined')
    .map((match, index) => ({
      transcript: transcripts[index],
      relevanceScore: match.relevanceScore,
      explanation: match.description
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}