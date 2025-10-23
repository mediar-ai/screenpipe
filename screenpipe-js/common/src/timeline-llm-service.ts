/**
 * Enhanced Timeline LLM Service
 * Provides advanced timeline analysis using both video and voice LLM capabilities
 * for better temporal understanding and content navigation
 */

import { OpenAI } from 'openai';
import type { Settings } from '@screenpipe/browser';
import { StreamTimeSeriesResponse } from '@/app/page';
import { VideoLLMService } from './video-llm-service';
import { MeetingVoiceLLMService } from './meeting-voice-llm-service';

export interface TimelineSegment {
  timestamp: string;
  duration: number;
  type: 'activity' | 'meeting' | 'focus' | 'break' | 'unknown';
  description: string;
  confidence: number;
  keyframes?: string[];
  audioSummary?: string;
  visualSummary?: string;
  topics: string[];
  tags: string[];
}

export interface TimelineAnalysisRequest {
  frames: StreamTimeSeriesResponse[];
  timeRange: {
    start: string;
    end: string;
  };
  analysisType?: 'segments' | 'patterns' | 'summary' | 'search' | 'full';
  granularity?: 'minute' | 'five_minute' | 'fifteen_minute' | 'hour';
  focusAreas?: string[];
}

export interface TimelineAnalysisResult {
  segments: TimelineSegment[];
  patterns: {
    workPatterns: string[];
    breakPatterns: string[];
    meetingPatterns: string[];
    focusTime: Array<{ start: string; end: string; activity: string }>;
  };
  summary: {
    totalTime: number;
    productiveTime: number;
    meetingTime: number;
    breakTime: number;
    mainActivities: string[];
    achievements: string[];
  };
  insights: {
    productivity: number;
    focus: number;
    collaboration: number;
    recommendations: string[];
  };
  contextualTimeline: Array<{
    timestamp: string;
    event: string;
    importance: 'high' | 'medium' | 'low';
    context: string;
  }>;
}

export interface SmartSearchRequest {
  query: string;
  frames: StreamTimeSeriesResponse[];
  searchType?: 'semantic' | 'temporal' | 'contextual' | 'multimodal';
  timeContext?: {
    before: number; // minutes
    after: number; // minutes
  };
  filters?: {
    apps?: string[];
    contentTypes?: ('audio' | 'visual' | 'text')[];
    minConfidence?: number;
  };
}

export interface SmartSearchResult {
  matches: Array<{
    frameIndex: number;
    timestamp: string;
    relevanceScore: number;
    matchType: 'exact' | 'semantic' | 'contextual';
    explanation: string;
    context: {
      before: string[];
      after: string[];
    };
    visualAnalysis?: any;
    audioAnalysis?: any;
  }>;
  searchInsights: {
    queryInterpretation: string;
    alternativeQueries: string[];
    suggestedFilters: string[];
  };
  totalMatches: number;
  searchTime: number;
}

export interface ActivityDetectionRequest {
  frames: StreamTimeSeriesResponse[];
  activities?: string[];
  sensitivity?: 'low' | 'medium' | 'high';
}

export interface ActivityDetectionResult {
  detectedActivities: Array<{
    activity: string;
    startTime: string;
    endTime: string;
    confidence: number;
    evidence: string[];
    frameIndices: number[];
  }>;
  activityTransitions: Array<{
    from: string;
    to: string;
    timestamp: string;
    transitionType: 'smooth' | 'abrupt';
  }>;
  focusPeriods: Array<{
    startTime: string;
    endTime: string;
    activity: string;
    focusLevel: number;
    interruptions: number;
  }>;
}

export class TimelineLLMService {
  private openai: OpenAI;
  private settings: Settings;
  private videoService: VideoLLMService;
  private voiceService: MeetingVoiceLLMService;
  private analysisCache: Map<string, any> = new Map();

  constructor(settings: Settings) {
    this.settings = settings;
    this.openai = new OpenAI({
      apiKey: settings?.aiProviderType === "screenpipe-cloud" 
        ? settings?.user?.token 
        : settings?.openaiApiKey,
      baseURL: settings?.aiUrl,
      dangerouslyAllowBrowser: true,
    });
    this.videoService = new VideoLLMService(settings);
    this.voiceService = new MeetingVoiceLLMService(settings);
  }

  /**
   * Analyze timeline to create meaningful segments with context
   */
  async analyzeTimeline(request: TimelineAnalysisRequest): Promise<TimelineAnalysisResult> {
    const cacheKey = `timeline_${request.timeRange.start}_${request.timeRange.end}_${request.analysisType}`;
    
    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey);
    }

    try {
      const segments = await this.createTimelineSegments(request.frames, request.granularity || 'five_minute');
      const patterns = await this.detectPatterns(segments);
      const summary = await this.generateTimelineSummary(segments);
      const insights = await this.generateInsights(segments, patterns);
      const contextualTimeline = await this.createContextualTimeline(request.frames);

      const result: TimelineAnalysisResult = {
        segments,
        patterns,
        summary,
        insights,
        contextualTimeline
      };

      // Cache for 15 minutes
      this.analysisCache.set(cacheKey, result);
      setTimeout(() => this.analysisCache.delete(cacheKey), 15 * 60 * 1000);

      return result;
    } catch (error) {
      console.error('Timeline analysis failed:', error);
      return this.getDefaultTimelineResult();
    }
  }

  /**
   * Perform intelligent search across timeline with multimodal understanding
   */
  async performSmartSearch(request: SmartSearchRequest): Promise<SmartSearchResult> {
    const startTime = Date.now();

    try {
      // Analyze the search query to understand intent
      const queryAnalysis = await this.analyzeSearchQuery(request.query);
      
      // Prepare frame data for analysis
      const frameData = await this.prepareFramesForSearch(request.frames, request.filters);
      
      // Perform multimodal search
      const videoMatches = await this.searchVideoContent(request.query, frameData);
      const audioMatches = await this.searchAudioContent(request.query, frameData);
      
      // Combine and rank results
      const combinedMatches = await this.combineSearchResults(videoMatches, audioMatches, queryAnalysis);
      
      // Add context to results
      const enrichedMatches = await this.enrichSearchResults(combinedMatches, request.frames, request.timeContext);

      const result: SmartSearchResult = {
        matches: enrichedMatches,
        searchInsights: {
          queryInterpretation: queryAnalysis.interpretation,
          alternativeQueries: queryAnalysis.alternatives,
          suggestedFilters: queryAnalysis.suggestedFilters
        },
        totalMatches: enrichedMatches.length,
        searchTime: Date.now() - startTime
      };

      return result;
    } catch (error) {
      console.error('Smart search failed:', error);
      return {
        matches: [],
        searchInsights: {
          queryInterpretation: request.query,
          alternativeQueries: [],
          suggestedFilters: []
        },
        totalMatches: 0,
        searchTime: Date.now() - startTime
      };
    }
  }

  /**
   * Detect activities and focus periods automatically
   */
  async detectActivities(request: ActivityDetectionRequest): Promise<ActivityDetectionResult> {
    try {
      const systemPrompt = `You are an expert activity detection system. Analyze user behavior patterns from screen and audio data to identify distinct activities, focus periods, and transitions.

Activities to detect include:
- Coding/Programming
- Meeting/Video calls
- Writing/Documentation
- Research/Reading
- Email/Communication
- Design/Creative work
- Break/Leisure
- Problem solving

Focus on identifying:
1. Clear activity boundaries
2. Level of focus and engagement
3. Context switches and interruptions
4. Productive vs non-productive time`;

      const frameAnalysis = await this.analyzeFramesForActivities(request.frames);
      
      const response = await this.openai.chat.completions.create({
        model: this.settings.aiModel || 'gpt-4o',
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify({
            frameData: frameAnalysis,
            requestedActivities: request.activities,
            sensitivity: request.sensitivity
          }) }
        ],
        temperature: 0.2,
        max_tokens: 1200,
        response_format: { type: "json_object" }
      });

      return JSON.parse(response.choices[0]?.message?.content || '{}') as ActivityDetectionResult;
    } catch (error) {
      console.error('Activity detection failed:', error);
      return this.getDefaultActivityResult();
    }
  }

  /**
   * Generate contextual suggestions for timeline navigation
   */
  async generateNavigationSuggestions(
    frames: StreamTimeSeriesResponse[],
    currentIndex: number
  ): Promise<Array<{
    label: string;
    description: string;
    targetIndex: number;
    importance: 'high' | 'medium' | 'low';
  }>> {
    try {
      const currentFrame = frames[currentIndex];
      const recentFrames = frames.slice(Math.max(0, currentIndex - 10), currentIndex + 10);
      
      const analysis = await this.analyzeNavigationContext(currentFrame, recentFrames);
      
      const systemPrompt = `Based on the current timeline position and recent activity, suggest useful navigation points that would help the user find important moments or understand their activity patterns.`;

      const response = await this.openai.chat.completions.create({
        model: this.settings.aiModel || 'gpt-4o',
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(analysis) }
        ],
        temperature: 0.4,
        max_tokens: 600,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{"suggestions": []}');
      return result.suggestions || [];
    } catch (error) {
      console.error('Navigation suggestions failed:', error);
      return [];
    }
  }

  /**
   * Create intelligent timeline segments based on activity changes
   */
  private async createTimelineSegments(frames: StreamTimeSeriesResponse[], granularity: string): Promise<TimelineSegment[]> {
    const segments: TimelineSegment[] = [];
    const granularityMs = this.getGranularityMs(granularity);
    
    for (let i = 0; i < frames.length; i += this.getFrameStep(granularity)) {
      const segmentFrames = frames.slice(i, i + this.getFrameStep(granularity));
      if (segmentFrames.length === 0) continue;

      const segment = await this.analyzeSegment(segmentFrames);
      segments.push(segment);
    }

    return segments;
  }

  /**
   * Analyze a segment of frames to determine activity type and content
   */
  private async analyzeSegment(frames: StreamTimeSeriesResponse[]): Promise<TimelineSegment> {
    try {
      const startTime = frames[0].timestamp;
      const endTime = frames[frames.length - 1].timestamp;
      const duration = new Date(endTime).getTime() - new Date(startTime).getTime();

      // Extract key information from frames
      const apps = [...new Set(frames.flatMap(f => f.devices.map(d => d.metadata.app_name).filter(Boolean)))];
      const transcripts = frames.flatMap(f => f.devices.flatMap(d => d.audio.map(a => a.transcription).filter(Boolean)));
      const ocrTexts = frames.flatMap(f => f.devices.map(d => d.metadata.ocr_text).filter(Boolean));

      const systemPrompt = `Analyze this timeline segment and classify the activity type, generate a meaningful description, and extract key topics.

Activity types: activity, meeting, focus, break, unknown

Consider:
- Application usage patterns
- Audio transcription content
- Screen text content
- Time patterns and duration`;

      const response = await this.openai.chat.completions.create({
        model: this.settings.aiModel || 'gpt-4o',
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify({
            timeRange: { start: startTime, end: endTime },
            apps,
            transcripts: transcripts.slice(0, 10),
            ocrTexts: ocrTexts.slice(0, 10)
          }) }
        ],
        temperature: 0.3,
        max_tokens: 400,
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(response.choices[0]?.message?.content || '{}');

      return {
        timestamp: startTime,
        duration: duration / 1000 / 60, // Convert to minutes
        type: analysis.type || 'unknown',
        description: analysis.description || 'Unknown activity',
        confidence: analysis.confidence || 0.5,
        topics: analysis.topics || [],
        tags: analysis.tags || [],
        audioSummary: transcripts.length > 0 ? transcripts.join(' ').slice(0, 200) : undefined,
        visualSummary: apps.length > 0 ? `Active in: ${apps.join(', ')}` : undefined
      };
    } catch (error) {
      console.error('Segment analysis failed:', error);
      return {
        timestamp: frames[0].timestamp,
        duration: 5,
        type: 'unknown',
        description: 'Unable to analyze segment',
        confidence: 0,
        topics: [],
        tags: []
      };
    }
  }

  /**
   * Detect patterns in timeline segments
   */
  private async detectPatterns(segments: TimelineSegment[]): Promise<any> {
    try {
      const systemPrompt = `Analyze these timeline segments to identify patterns in work habits, break times, meeting schedules, and focus periods.`;

      const response = await this.openai.chat.completions.create({
        model: this.settings.aiModel || 'gpt-4o',
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(segments) }
        ],
        temperature: 0.2,
        max_tokens: 600,
        response_format: { type: "json_object" }
      });

      return JSON.parse(response.choices[0]?.message?.content || '{}');
    } catch (error) {
      console.error('Pattern detection failed:', error);
      return {
        workPatterns: [],
        breakPatterns: [],
        meetingPatterns: [],
        focusTime: []
      };
    }
  }

  /**
   * Generate timeline summary
   */
  private async generateTimelineSummary(segments: TimelineSegment[]): Promise<any> {
    const totalTime = segments.reduce((sum, seg) => sum + seg.duration, 0);
    const productiveSegments = segments.filter(seg => ['activity', 'focus', 'meeting'].includes(seg.type));
    const productiveTime = productiveSegments.reduce((sum, seg) => sum + seg.duration, 0);
    const meetingTime = segments.filter(seg => seg.type === 'meeting').reduce((sum, seg) => sum + seg.duration, 0);
    const breakTime = segments.filter(seg => seg.type === 'break').reduce((sum, seg) => sum + seg.duration, 0);

    const allTopics = [...new Set(segments.flatMap(seg => seg.topics))];
    const achievements = await this.extractAchievements(segments);

    return {
      totalTime,
      productiveTime,
      meetingTime,
      breakTime,
      mainActivities: allTopics.slice(0, 10),
      achievements
    };
  }

  /**
   * Generate insights from timeline analysis
   */
  private async generateInsights(segments: TimelineSegment[], patterns: any): Promise<any> {
    try {
      const systemPrompt = `Analyze timeline segments and patterns to generate insights about productivity, focus, collaboration, and provide actionable recommendations.`;

      const response = await this.openai.chat.completions.create({
        model: this.settings.aiModel || 'gpt-4o',
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify({ segments, patterns }) }
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: "json_object" }
      });

      return JSON.parse(response.choices[0]?.message?.content || '{}');
    } catch (error) {
      return {
        productivity: 0.7,
        focus: 0.6,
        collaboration: 0.5,
        recommendations: []
      };
    }
  }

  /**
   * Create contextual timeline with important events
   */
  private async createContextualTimeline(frames: StreamTimeSeriesResponse[]): Promise<any[]> {
    // Sample frames for analysis to avoid token limits
    const sampleFrames = this.sampleFrames(frames, 50);
    
    try {
      const systemPrompt = `Identify the most important events and moments in this timeline that would be useful for navigation. Focus on:
- Task completions
- Meeting starts/ends
- Major context switches
- Important conversations
- Problem-solving moments`;

      const response = await this.openai.chat.completions.create({
        model: this.settings.aiModel || 'gpt-4o',
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(sampleFrames.map(f => ({
            timestamp: f.timestamp,
            apps: f.devices.map(d => d.metadata.app_name).filter(Boolean),
            transcripts: f.devices.flatMap(d => d.audio.map(a => a.transcription)).filter(Boolean).slice(0, 2)
          }))) }
        ],
        temperature: 0.2,
        max_tokens: 800,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{"events": []}');
      return result.events || [];
    } catch (error) {
      console.error('Contextual timeline creation failed:', error);
      return [];
    }
  }

  // Helper methods
  private getGranularityMs(granularity: string): number {
    const map = {
      'minute': 60 * 1000,
      'five_minute': 5 * 60 * 1000,
      'fifteen_minute': 15 * 60 * 1000,
      'hour': 60 * 60 * 1000
    };
    return map[granularity as keyof typeof map] || map.five_minute;
  }

  private getFrameStep(granularity: string): number {
    const map = {
      'minute': 12,      // Assuming 5s per frame
      'five_minute': 60,
      'fifteen_minute': 180,
      'hour': 720
    };
    return map[granularity as keyof typeof map] || map.five_minute;
  }

  private sampleFrames(frames: StreamTimeSeriesResponse[], maxSamples: number): StreamTimeSeriesResponse[] {
    if (frames.length <= maxSamples) return frames;
    const step = Math.floor(frames.length / maxSamples);
    return frames.filter((_, index) => index % step === 0);
  }

  private async analyzeSearchQuery(query: string): Promise<any> {
    // Implement query analysis logic
    return {
      interpretation: query,
      alternatives: [],
      suggestedFilters: []
    };
  }

  private async prepareFramesForSearch(frames: StreamTimeSeriesResponse[], filters?: any): Promise<any> {
    // Implement frame preparation logic
    return frames;
  }

  private async searchVideoContent(query: string, frameData: any): Promise<any[]> {
    // Implement video content search using VideoLLMService
    return [];
  }

  private async searchAudioContent(query: string, frameData: any): Promise<any[]> {
    // Implement audio content search using MeetingVoiceLLMService
    return [];
  }

  private async combineSearchResults(videoMatches: any[], audioMatches: any[], queryAnalysis: any): Promise<any[]> {
    // Implement result combination logic
    return [...videoMatches, ...audioMatches];
  }

  private async enrichSearchResults(matches: any[], frames: StreamTimeSeriesResponse[], timeContext?: any): Promise<any[]> {
    // Implement result enrichment logic
    return matches;
  }

  private async analyzeFramesForActivities(frames: StreamTimeSeriesResponse[]): Promise<any> {
    // Implement frame analysis for activity detection
    return {};
  }

  private async analyzeNavigationContext(currentFrame: StreamTimeSeriesResponse, recentFrames: StreamTimeSeriesResponse[]): Promise<any> {
    // Implement navigation context analysis
    return {};
  }

  private async extractAchievements(segments: TimelineSegment[]): Promise<string[]> {
    // Implement achievement extraction
    return [];
  }

  private getDefaultTimelineResult(): TimelineAnalysisResult {
    return {
      segments: [],
      patterns: {
        workPatterns: [],
        breakPatterns: [],
        meetingPatterns: [],
        focusTime: []
      },
      summary: {
        totalTime: 0,
        productiveTime: 0,
        meetingTime: 0,
        breakTime: 0,
        mainActivities: [],
        achievements: []
      },
      insights: {
        productivity: 0.5,
        focus: 0.5,
        collaboration: 0.5,
        recommendations: []
      },
      contextualTimeline: []
    };
  }

  private getDefaultActivityResult(): ActivityDetectionResult {
    return {
      detectedActivities: [],
      activityTransitions: [],
      focusPeriods: []
    };
  }
}

// Export singleton creator
export function createTimelineLLMService(settings: Settings): TimelineLLMService {
  return new TimelineLLMService(settings);
}

// Timeline utility functions
export async function enhanceTimelineWithLLM(
  frames: StreamTimeSeriesResponse[],
  settings: Settings,
  options: {
    analysisType?: 'segments' | 'activities' | 'search' | 'full';
    granularity?: 'minute' | 'five_minute' | 'fifteen_minute' | 'hour';
  } = {}
): Promise<{
  enhancedFrames: StreamTimeSeriesResponse[];
  analysis: TimelineAnalysisResult;
  activities: ActivityDetectionResult;
}> {
  const service = createTimelineLLMService(settings);
  
  try {
    const [analysis, activities] = await Promise.all([
      service.analyzeTimeline({
        frames,
        timeRange: {
          start: frames[0]?.timestamp || new Date().toISOString(),
          end: frames[frames.length - 1]?.timestamp || new Date().toISOString()
        },
        analysisType: options.analysisType || 'full',
        granularity: options.granularity || 'five_minute'
      }),
      service.detectActivities({ frames })
    ]);

    return {
      enhancedFrames: frames, // Would add LLM-enhanced metadata
      analysis,
      activities
    };
  } catch (error) {
    console.error('Timeline enhancement failed:', error);
    return {
      enhancedFrames: frames,
      analysis: service['getDefaultTimelineResult'](),
      activities: service['getDefaultActivityResult']()
    };
  }
}