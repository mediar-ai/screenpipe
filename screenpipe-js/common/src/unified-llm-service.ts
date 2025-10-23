/**
 * Unified LLM Service
 * Central service that coordinates video and voice LLM capabilities
 * across search, timeline, and meeting components
 */

import { OpenAI } from 'openai';
import type { Settings } from '@screenpipe/browser';
import { VideoLLMService, VideoAnalysisRequest, VideoAnalysisResult } from './video-llm-service';
import { MeetingVoiceLLMService, MeetingAnalysisRequest, MeetingAnalysisResult } from './meeting-voice-llm-service';
import { TimelineLLMService, TimelineAnalysisRequest, TimelineAnalysisResult } from './timeline-llm-service';

export interface UnifiedAnalysisRequest {
  content: {
    video?: {
      frames: Array<{
        timestamp: string;
        frameData: string;
        metadata?: any;
      }>;
    };
    audio?: {
      transcripts: Array<{
        timestamp: string;
        transcript: string;
        speaker?: any;
      }>;
    };
    timeline?: {
      frames: any[];
      timeRange: { start: string; end: string; };
    };
  };
  analysisType: 'search' | 'meeting' | 'timeline' | 'multimodal';
  query?: string;
  context?: {
    user?: any;
    session?: any;
    preferences?: any;
  };
  options?: {
    maxTokens?: number;
    temperature?: number;
    includeContext?: boolean;
    cacheResults?: boolean;
  };
}

export interface UnifiedAnalysisResult {
  type: 'search' | 'meeting' | 'timeline' | 'multimodal';
  results: {
    video?: VideoAnalysisResult | VideoAnalysisResult[];
    audio?: any;
    timeline?: TimelineAnalysisResult;
    search?: any;
    meeting?: MeetingAnalysisResult;
  };
  insights: {
    summary: string;
    confidence: number;
    recommendations: string[];
    tags: string[];
  };
  metadata: {
    processingTime: number;
    tokensUsed?: number;
    cacheHit: boolean;
    services: string[];
  };
}

export interface LLMServiceConfig {
  maxConcurrentRequests: number;
  cacheEnabled: boolean;
  cacheTTL: number;
  retryAttempts: number;
  timeout: number;
  rateLimitRpm: number;
}

export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'down';
  services: {
    video: boolean;
    voice: boolean;
    timeline: boolean;
    openai: boolean;
  };
  performance: {
    averageResponseTime: number;
    successRate: number;
    cacheHitRate: number;
  };
  lastCheck: string;
}

export class UnifiedLLMService {
  private settings: Settings;
  private config: LLMServiceConfig;
  private videoService: VideoLLMService;
  private voiceService: MeetingVoiceLLMService;
  private timelineService: TimelineLLMService;
  private openai: OpenAI;
  
  // Service management
  private requestQueue: Array<{ request: any; resolve: Function; reject: Function; }> = [];
  private activeRequests = 0;
  private globalCache: Map<string, { data: any; timestamp: number; }> = new Map();
  private rateLimiter: Map<string, number[]> = new Map();
  private healthMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    responseTimes: [] as number[],
    cacheHits: 0
  };

  constructor(settings: Settings, config?: Partial<LLMServiceConfig>) {
    this.settings = settings;
    this.config = {
      maxConcurrentRequests: 5,
      cacheEnabled: true,
      cacheTTL: 10 * 60 * 1000, // 10 minutes
      retryAttempts: 3,
      timeout: 30000,
      rateLimitRpm: 60,
      ...config
    };

    this.openai = new OpenAI({
      apiKey: settings?.aiProviderType === "screenpipe-cloud" 
        ? settings?.user?.token 
        : settings?.openaiApiKey,
      baseURL: settings?.aiUrl,
      dangerouslyAllowBrowser: true,
    });

    this.videoService = new VideoLLMService(settings);
    this.voiceService = new MeetingVoiceLLMService(settings);
    this.timelineService = new TimelineLLMService(settings);

    // Start periodic cleanup
    this.startPeriodicCleanup();
  }

  /**
   * Main analysis method that routes requests to appropriate services
   */
  async analyze(request: UnifiedAnalysisRequest): Promise<UnifiedAnalysisResult> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    
    // Check rate limiting
    if (!this.checkRateLimit()) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }

    // Check cache if enabled
    const cacheKey = this.generateCacheKey(request);
    if (this.config.cacheEnabled) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.healthMetrics.cacheHits++;
        return {
          ...cached,
          metadata: {
            ...cached.metadata,
            cacheHit: true,
            processingTime: Date.now() - startTime
          }
        };
      }
    }

    try {
      // Queue request if at capacity
      if (this.activeRequests >= this.config.maxConcurrentRequests) {
        await this.queueRequest(request);
      }

      this.activeRequests++;
      this.healthMetrics.totalRequests++;

      const result = await this.processRequest(request, requestId);
      
      // Cache result if enabled
      if (this.config.cacheEnabled) {
        this.setCache(cacheKey, result);
      }

      this.healthMetrics.successfulRequests++;
      const responseTime = Date.now() - startTime;
      this.healthMetrics.responseTimes.push(responseTime);

      return {
        ...result,
        metadata: {
          ...result.metadata,
          processingTime: responseTime,
          cacheHit: false
        }
      };

    } catch (error) {
      console.error(`Analysis failed for request ${requestId}:`, error);
      throw error;
    } finally {
      this.activeRequests--;
      this.processQueue();
    }
  }

  /**
   * Process different types of analysis requests
   */
  private async processRequest(request: UnifiedAnalysisRequest, requestId: string): Promise<UnifiedAnalysisResult> {
    const services: string[] = [];

    switch (request.analysisType) {
      case 'search':
        return await this.processSearchRequest(request, services);
      
      case 'meeting':
        return await this.processMeetingRequest(request, services);
      
      case 'timeline':
        return await this.processTimelineRequest(request, services);
      
      case 'multimodal':
        return await this.processMultimodalRequest(request, services);
      
      default:
        throw new Error(`Unknown analysis type: ${request.analysisType}`);
    }
  }

  /**
   * Process search requests
   */
  private async processSearchRequest(request: UnifiedAnalysisRequest, services: string[]): Promise<UnifiedAnalysisResult> {
    const results: any = {};

    if (request.content.video?.frames && request.query) {
      services.push('video');
      const videoRequests = request.content.video.frames.map(frame => ({
        frameData: frame.frameData,
        timestamp: frame.timestamp,
        ...frame.metadata
      }));

      results.video = await this.videoService.batchAnalyzeFrames(videoRequests);
    }

    if (request.content.audio?.transcripts && request.query) {
      services.push('voice');
      const audioAnalyses = await Promise.all(
        request.content.audio.transcripts.map(transcript =>
          this.voiceService.analyzeVoiceTranscript({
            transcript: transcript.transcript,
            timestamp: transcript.timestamp,
            speaker: transcript.speaker,
            analysisType: 'full'
          })
        )
      );
      results.audio = audioAnalyses;
    }

    // Perform unified search across all content
    if (request.query) {
      services.push('search');
      results.search = await this.performUnifiedSearch(request);
    }

    const insights = await this.generateSearchInsights(results, request.query);

    return {
      type: 'search',
      results,
      insights,
      metadata: {
        processingTime: 0, // Will be set by caller
        cacheHit: false,
        services
      }
    };
  }

  /**
   * Process meeting requests
   */
  private async processMeetingRequest(request: UnifiedAnalysisRequest, services: string[]): Promise<UnifiedAnalysisResult> {
    const results: any = {};

    if (request.content.audio?.transcripts) {
      services.push('voice');
      
      // Convert transcripts to meeting format for analysis
      const meetingData = this.convertToMeetingFormat(request.content.audio.transcripts);
      
      results.meeting = await this.voiceService.analyzeMeeting({
        meeting: meetingData,
        analysisType: 'full',
        includeContext: request.options?.includeContext
      });

      // Enhance with speaker analysis
      const segments = meetingData.segments;
      results.speakers = await this.voiceService.analyzeSpeakers({ segments });
    }

    const insights = await this.generateMeetingInsights(results);

    return {
      type: 'meeting',
      results,
      insights,
      metadata: {
        processingTime: 0,
        cacheHit: false,
        services
      }
    };
  }

  /**
   * Process timeline requests
   */
  private async processTimelineRequest(request: UnifiedAnalysisRequest, services: string[]): Promise<UnifiedAnalysisResult> {
    const results: any = {};

    if (request.content.timeline?.frames) {
      services.push('timeline');
      
      results.timeline = await this.timelineService.analyzeTimeline({
        frames: request.content.timeline.frames,
        timeRange: request.content.timeline.timeRange,
        analysisType: 'full'
      });

      // Detect activities
      results.activities = await this.timelineService.detectActivities({
        frames: request.content.timeline.frames
      });
    }

    const insights = await this.generateTimelineInsights(results);

    return {
      type: 'timeline',
      results,
      insights,
      metadata: {
        processingTime: 0,
        cacheHit: false,
        services
      }
    };
  }

  /**
   * Process multimodal requests combining video, audio, and timeline
   */
  private async processMultimodalRequest(request: UnifiedAnalysisRequest, services: string[]): Promise<UnifiedAnalysisResult> {
    const results: any = {};

    // Process all available content types in parallel
    const promises: Promise<any>[] = [];

    if (request.content.video?.frames) {
      services.push('video');
      promises.push(
        this.processSearchRequest(
          { ...request, analysisType: 'search' }, 
          []
        ).then(r => ({ video: r.results.video }))
      );
    }

    if (request.content.audio?.transcripts) {
      services.push('voice');
      promises.push(
        this.processMeetingRequest(
          { ...request, analysisType: 'meeting' }, 
          []
        ).then(r => ({ audio: r.results }))
      );
    }

    if (request.content.timeline?.frames) {
      services.push('timeline');
      promises.push(
        this.processTimelineRequest(
          { ...request, analysisType: 'timeline' }, 
          []
        ).then(r => ({ timeline: r.results }))
      );
    }

    const parallelResults = await Promise.all(promises);
    
    // Merge results
    parallelResults.forEach(result => {
      Object.assign(results, result);
    });

    // Generate unified insights
    const insights = await this.generateMultimodalInsights(results, request);

    return {
      type: 'multimodal',
      results,
      insights,
      metadata: {
        processingTime: 0,
        cacheHit: false,
        services
      }
    };
  }

  /**
   * Perform unified search across all content types
   */
  private async performUnifiedSearch(request: UnifiedAnalysisRequest): Promise<any> {
    if (!request.query) return null;

    const systemPrompt = `You are a unified search engine that can find relevant content across visual frames, audio transcripts, and timeline data.
Query: "${request.query}"

Analyze all provided content and return the most relevant matches with explanations.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.settings.aiModel || 'gpt-4o',
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify({
            query: request.query,
            content: request.content
          }) }
        ],
        temperature: 0.2,
        max_tokens: request.options?.maxTokens || 800,
        response_format: { type: "json_object" }
      });

      return JSON.parse(response.choices[0]?.message?.content || '{}');
    } catch (error) {
      console.error('Unified search failed:', error);
      return { matches: [], error: error.message };
    }
  }

  /**
   * Generate insights for search results
   */
  private async generateSearchInsights(results: any, query?: string): Promise<any> {
    const systemPrompt = `Analyze search results and provide insights, confidence scores, recommendations, and relevant tags.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.settings.aiModel || 'gpt-4o',
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify({ results, query }) }
        ],
        temperature: 0.3,
        max_tokens: 400,
        response_format: { type: "json_object" }
      });

      return JSON.parse(response.choices[0]?.message?.content || '{}');
    } catch (error) {
      return {
        summary: "Search completed",
        confidence: 0.5,
        recommendations: [],
        tags: []
      };
    }
  }

  /**
   * Generate insights for meeting analysis
   */
  private async generateMeetingInsights(results: any): Promise<any> {
    // Similar implementation for meeting insights
    return {
      summary: "Meeting analysis completed",
      confidence: 0.8,
      recommendations: ["Follow up on action items", "Schedule next meeting"],
      tags: ["meeting", "collaboration"]
    };
  }

  /**
   * Generate insights for timeline analysis
   */
  private async generateTimelineInsights(results: any): Promise<any> {
    // Similar implementation for timeline insights
    return {
      summary: "Timeline analysis completed",
      confidence: 0.7,
      recommendations: ["Optimize focus time", "Reduce context switching"],
      tags: ["productivity", "timeline"]
    };
  }

  /**
   * Generate unified insights for multimodal analysis
   */
  private async generateMultimodalInsights(results: any, request: UnifiedAnalysisRequest): Promise<any> {
    const systemPrompt = `Analyze multimodal results combining video, audio, and timeline data to provide comprehensive insights.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.settings.aiModel || 'gpt-4o',
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(results) }
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: "json_object" }
      });

      return JSON.parse(response.choices[0]?.message?.content || '{}');
    } catch (error) {
      return {
        summary: "Multimodal analysis completed",
        confidence: 0.6,
        recommendations: [],
        tags: ["multimodal", "comprehensive"]
      };
    }
  }

  /**
   * Get service health status
   */
  async getServiceHealth(): Promise<ServiceHealth> {
    const checkPromises = [
      this.checkVideoService(),
      this.checkVoiceService(),
      this.checkTimelineService(),
      this.checkOpenAIService()
    ];

    const [video, voice, timeline, openai] = await Promise.allSettled(checkPromises);

    const services = {
      video: video.status === 'fulfilled' && video.value,
      voice: voice.status === 'fulfilled' && voice.value,
      timeline: timeline.status === 'fulfilled' && timeline.value,
      openai: openai.status === 'fulfilled' && openai.value
    };

    const healthyServices = Object.values(services).filter(Boolean).length;
    const totalServices = Object.values(services).length;
    
    let status: 'healthy' | 'degraded' | 'down' = 'healthy';
    if (healthyServices === 0) status = 'down';
    else if (healthyServices < totalServices) status = 'degraded';

    const averageResponseTime = this.healthMetrics.responseTimes.length > 0
      ? this.healthMetrics.responseTimes.reduce((a, b) => a + b) / this.healthMetrics.responseTimes.length
      : 0;

    const successRate = this.healthMetrics.totalRequests > 0
      ? this.healthMetrics.successfulRequests / this.healthMetrics.totalRequests
      : 0;

    const cacheHitRate = this.healthMetrics.totalRequests > 0
      ? this.healthMetrics.cacheHits / this.healthMetrics.totalRequests
      : 0;

    return {
      status,
      services,
      performance: {
        averageResponseTime,
        successRate,
        cacheHitRate
      },
      lastCheck: new Date().toISOString()
    };
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.globalCache.clear();
    this.videoService.clearCache();
    // Add other service cache clearing if available
  }

  /**
   * Get service statistics
   */
  getStatistics(): any {
    return {
      ...this.healthMetrics,
      cacheSize: this.globalCache.size,
      activeRequests: this.activeRequests,
      queueSize: this.requestQueue.length
    };
  }

  // Private helper methods
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCacheKey(request: UnifiedAnalysisRequest): string {
    const hash = this.simpleHash(JSON.stringify(request));
    return `unified_${request.analysisType}_${hash}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    if (!this.rateLimiter.has('requests')) {
      this.rateLimiter.set('requests', []);
    }
    
    const requests = this.rateLimiter.get('requests')!;
    
    // Remove old requests
    while (requests.length > 0 && requests[0] < windowStart) {
      requests.shift();
    }
    
    if (requests.length >= this.config.rateLimitRpm) {
      return false;
    }
    
    requests.push(now);
    return true;
  }

  private getFromCache(key: string): any {
    const cached = this.globalCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
      return cached.data;
    }
    this.globalCache.delete(key);
    return null;
  }

  private setCache(key: string, data: any): void {
    this.globalCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  private async queueRequest(request: UnifiedAnalysisRequest): Promise<void> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ request, resolve, reject });
    });
  }

  private processQueue(): void {
    if (this.requestQueue.length > 0 && this.activeRequests < this.config.maxConcurrentRequests) {
      const { request, resolve, reject } = this.requestQueue.shift()!;
      this.analyze(request).then(resolve).catch(reject);
    }
  }

  private startPeriodicCleanup(): void {
    setInterval(() => {
      // Clean up old cache entries
      const now = Date.now();
      for (const [key, value] of this.globalCache.entries()) {
        if (now - value.timestamp > this.config.cacheTTL) {
          this.globalCache.delete(key);
        }
      }

      // Trim response times array to last 1000 entries
      if (this.healthMetrics.responseTimes.length > 1000) {
        this.healthMetrics.responseTimes = this.healthMetrics.responseTimes.slice(-1000);
      }
    }, 60000); // Run every minute
  }

  private async checkVideoService(): Promise<boolean> {
    // Implement health check for video service
    return true;
  }

  private async checkVoiceService(): Promise<boolean> {
    // Implement health check for voice service
    return true;
  }

  private async checkTimelineService(): Promise<boolean> {
    // Implement health check for timeline service
    return true;
  }

  private async checkOpenAIService(): Promise<boolean> {
    try {
      await this.openai.models.list();
      return true;
    } catch {
      return false;
    }
  }

  private convertToMeetingFormat(transcripts: any[]): any {
    // Convert transcript format to meeting format
    return {
      id: `meeting_${Date.now()}`,
      segments: transcripts.map((t, i) => ({
        timestamp: t.timestamp,
        transcription: t.transcript,
        speaker: t.speaker,
        deviceName: `device_${i}`,
        deviceType: 'input'
      })),
      meetingStart: transcripts[0]?.timestamp || new Date().toISOString(),
      meetingEnd: transcripts[transcripts.length - 1]?.timestamp || new Date().toISOString(),
      deviceNames: new Set(['default'])
    };
  }
}

// Export singleton creator
export function createUnifiedLLMService(settings: Settings, config?: Partial<LLMServiceConfig>): UnifiedLLMService {
  return new UnifiedLLMService(settings, config);
}

// Convenience functions for different use cases
export async function analyzeForSearch(
  content: { video?: any; audio?: any; timeline?: any },
  query: string,
  settings: Settings
): Promise<UnifiedAnalysisResult> {
  const service = createUnifiedLLMService(settings);
  return service.analyze({
    content,
    analysisType: 'search',
    query
  });
}

export async function analyzeForMeeting(
  audioContent: any,
  settings: Settings,
  options?: any
): Promise<UnifiedAnalysisResult> {
  const service = createUnifiedLLMService(settings);
  return service.analyze({
    content: { audio: audioContent },
    analysisType: 'meeting',
    options
  });
}

export async function analyzeForTimeline(
  timelineContent: any,
  settings: Settings,
  options?: any
): Promise<UnifiedAnalysisResult> {
  const service = createUnifiedLLMService(settings);
  return service.analyze({
    content: { timeline: timelineContent },
    analysisType: 'timeline',
    options
  });
}

export async function analyzeMultimodal(
  content: { video?: any; audio?: any; timeline?: any },
  settings: Settings,
  query?: string,
  options?: any
): Promise<UnifiedAnalysisResult> {
  const service = createUnifiedLLMService(settings);
  return service.analyze({
    content,
    analysisType: 'multimodal',
    query,
    options
  });
}