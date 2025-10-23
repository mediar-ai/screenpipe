/**
 * Enhanced Meeting Voice LLM Service
 * Provides advanced voice analysis, transcription improvement, and meeting intelligence
 */

import { OpenAI } from 'openai';
import type { Settings } from '@screenpipe/browser';
import { Meeting, MeetingSegment } from '@/components/meeting-history/types';

export interface EnhancedTranscriptionRequest {
  rawTranscript: string;
  timestamp: string;
  speaker?: {
    id: string;
    name: string;
  };
  audioContext?: {
    previousSegments: string[];
    nextSegments: string[];
    meetingTitle?: string;
    meetingType?: string;
  };
  improvementType?: 'accuracy' | 'punctuation' | 'speaker_diarization' | 'full';
}

export interface EnhancedTranscriptionResult {
  improvedTranscript: string;
  confidence: number;
  corrections: Array<{
    original: string;
    corrected: string;
    reason: string;
  }>;
  speakerIdentification: {
    speakerId: string;
    speakerName: string;
    confidence: number;
  };
  sentiment: 'positive' | 'negative' | 'neutral';
  emotions: string[];
  keyPoints: string[];
}

export interface MeetingAnalysisRequest {
  meeting: Meeting;
  analysisType?: 'summary' | 'action_items' | 'decisions' | 'insights' | 'full';
  customPrompt?: string;
  includeContext?: boolean;
}

export interface MeetingAnalysisResult {
  summary: string;
  keyTopics: string[];
  actionItems: Array<{
    item: string;
    assignee?: string;
    dueDate?: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  decisions: Array<{
    decision: string;
    context: string;
    stakeholders: string[];
  }>;
  insights: {
    participation: Record<string, number>;
    sentiment: Record<string, string>;
    topicFlow: string[];
    recommendations: string[];
  };
  nextSteps: string[];
  confidence: number;
}

export interface SpeakerAnalysisRequest {
  segments: MeetingSegment[];
  knownSpeakers?: Array<{
    id: string;
    name: string;
    voiceProfile?: string;
  }>;
}

export interface SpeakerAnalysisResult {
  speakerMapping: Record<string, {
    name: string;
    segments: number[];
    characteristics: string[];
    confidence: number;
  }>;
  conversationFlow: Array<{
    timestamp: string;
    speaker: string;
    topic: string;
    sentiment: string;
  }>;
  speakerInsights: Record<string, {
    speakingTime: number;
    topics: string[];
    sentiment: string;
    participation: number;
  }>;
}

export interface RealTimeAnalysisRequest {
  currentTranscript: string;
  recentContext: string[];
  meetingMetadata?: {
    title?: string;
    participants?: string[];
    agenda?: string[];
  };
}

export interface RealTimeAnalysisResult {
  liveSummary: string;
  currentTopic: string;
  suggestedActions: string[];
  conversationQuality: {
    clarity: number;
    engagement: number;
    productivity: number;
  };
  warnings: string[];
  nextTopicSuggestion?: string;
}

export class MeetingVoiceLLMService {
  private openai: OpenAI;
  private settings: Settings;
  private analysisCache: Map<string, any> = new Map();
  private speakerProfiles: Map<string, any> = new Map();

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
   * Enhance transcription quality using LLM context understanding
   */
  async enhanceTranscription(request: EnhancedTranscriptionRequest): Promise<EnhancedTranscriptionResult> {
    const cacheKey = `transcription_${request.timestamp}_${request.improvementType}`;
    
    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey);
    }

    try {
      const systemPrompt = this.getTranscriptionPrompt(request.improvementType || 'full');
      const contextualPrompt = this.buildTranscriptionContext(request);

      const response = await this.openai.chat.completions.create({
        model: this.settings.aiModel || 'gpt-4o',
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contextualPrompt }
        ],
        temperature: 0.2,
        max_tokens: 800,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{}') as EnhancedTranscriptionResult;
      
      // Cache for 10 minutes
      this.analysisCache.set(cacheKey, result);
      setTimeout(() => this.analysisCache.delete(cacheKey), 10 * 60 * 1000);
      
      return result;
    } catch (error) {
      console.error('Transcription enhancement failed:', error);
      return this.getDefaultTranscriptionResult(request.rawTranscript);
    }
  }

  /**
   * Perform comprehensive meeting analysis
   */
  async analyzeMeeting(request: MeetingAnalysisRequest): Promise<MeetingAnalysisResult> {
    const cacheKey = `meeting_${request.meeting.id}_${request.analysisType}`;
    
    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey);
    }

    try {
      const transcript = this.buildMeetingTranscript(request.meeting);
      const systemPrompt = this.getMeetingAnalysisPrompt(request.analysisType || 'full');
      
      const contextualPrompt = `
Meeting Title: ${request.meeting.humanName || request.meeting.aiName || 'Unknown'}
Duration: ${this.calculateMeetingDuration(request.meeting)}
Participants: ${Array.from(request.meeting.deviceNames).join(', ')}

${request.customPrompt ? `Custom Instructions: ${request.customPrompt}\n` : ''}

Full Transcript:
${transcript}

${request.includeContext ? `Previous Meeting Context: ${this.getPreviousMeetingContext(request.meeting)}` : ''}
`;

      const response = await this.openai.chat.completions.create({
        model: this.settings.aiModel || 'gpt-4o',
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contextualPrompt }
        ],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{}') as MeetingAnalysisResult;
      
      // Cache for 30 minutes
      this.analysisCache.set(cacheKey, result);
      setTimeout(() => this.analysisCache.delete(cacheKey), 30 * 60 * 1000);
      
      return result;
    } catch (error) {
      console.error('Meeting analysis failed:', error);
      return this.getDefaultMeetingResult();
    }
  }

  /**
   * Analyze speaker patterns and identify participants
   */
  async analyzeSpeakers(request: SpeakerAnalysisRequest): Promise<SpeakerAnalysisResult> {
    try {
      const systemPrompt = `You are an expert in speaker diarization and conversation analysis. 
Analyze the conversation segments to identify unique speakers, their characteristics, and conversation patterns.
Use linguistic patterns, speech styles, and contextual cues to group segments by speaker.`;

      const segmentData = request.segments.map((segment, index) => ({
        index,
        timestamp: segment.timestamp,
        text: segment.transcription,
        deviceType: segment.deviceType,
        existingSpeaker: segment.speaker?.name
      }));

      const response = await this.openai.chat.completions.create({
        model: this.settings.aiModel || 'gpt-4o',
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify({
            segments: segmentData,
            knownSpeakers: request.knownSpeakers || []
          }) }
        ],
        temperature: 0.2,
        max_tokens: 1200,
        response_format: { type: "json_object" }
      });

      return JSON.parse(response.choices[0]?.message?.content || '{}') as SpeakerAnalysisResult;
    } catch (error) {
      console.error('Speaker analysis failed:', error);
      return this.getDefaultSpeakerResult();
    }
  }

  /**
   * Provide real-time meeting analysis and suggestions
   */
  async analyzeRealTime(request: RealTimeAnalysisRequest): Promise<RealTimeAnalysisResult> {
    try {
      const systemPrompt = `You are a real-time meeting assistant. Analyze the current conversation state and provide helpful insights.
Focus on: current topic, conversation quality, potential action items, and helpful suggestions.`;

      const contextualPrompt = `
Current statement: "${request.currentTranscript}"
Recent context: ${request.recentContext.join(' ')}
${request.meetingMetadata ? `Meeting info: ${JSON.stringify(request.meetingMetadata)}` : ''}

Analyze the current state and provide real-time insights.
`;

      const response = await this.openai.chat.completions.create({
        model: this.settings.aiModel || 'gpt-4o',
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contextualPrompt }
        ],
        temperature: 0.4,
        max_tokens: 600,
        response_format: { type: "json_object" }
      });

      return JSON.parse(response.choices[0]?.message?.content || '{}') as RealTimeAnalysisResult;
    } catch (error) {
      console.error('Real-time analysis failed:', error);
      return this.getDefaultRealTimeResult();
    }
  }

  /**
   * Generate meeting summary with different detail levels
   */
  async generateSmartSummary(
    meeting: Meeting, 
    summaryType: 'brief' | 'detailed' | 'executive' | 'action_focused' = 'detailed'
  ): Promise<string> {
    try {
      const transcript = this.buildMeetingTranscript(meeting);
      const prompts = {
        brief: "Create a 2-3 sentence summary focusing on the main outcome and decisions.",
        detailed: "Create a comprehensive summary covering all major topics, decisions, and action items.",
        executive: "Create an executive summary focusing on business impact, decisions, and strategic implications.",
        action_focused: "Create a summary that emphasizes action items, deadlines, and next steps."
      };

      const response = await this.openai.chat.completions.create({
        model: this.settings.aiModel || 'gpt-4o',
        messages: [
          {
            role: "system",
            content: `You are a professional meeting summarizer. ${prompts[summaryType]}`
          },
          {
            role: "user",
            content: `Meeting: ${meeting.humanName || meeting.aiName}\nTranscript:\n${transcript}`
          }
        ],
        temperature: 0.3,
        max_tokens: summaryType === 'brief' ? 150 : 500
      });

      return response.choices[0]?.message?.content || "Unable to generate summary";
    } catch (error) {
      console.error('Smart summary generation failed:', error);
      return "Failed to generate meeting summary";
    }
  }

  /**
   * Extract action items with context and priority
   */
  async extractActionItems(meeting: Meeting): Promise<Array<{
    item: string;
    context: string;
    assignee?: string;
    deadline?: string;
    priority: 'high' | 'medium' | 'low';
    confidence: number;
  }>> {
    try {
      const transcript = this.buildMeetingTranscript(meeting);
      const systemPrompt = `You are an expert at extracting action items from meeting transcripts.
Identify specific, actionable tasks with their context, potential assignees, and priority levels.
Look for phrases like "will do", "should", "need to", "action", "follow up", etc.`;

      const response = await this.openai.chat.completions.create({
        model: this.settings.aiModel || 'gpt-4o',
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: transcript }
        ],
        temperature: 0.2,
        max_tokens: 800,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{"actionItems": []}');
      return result.actionItems || [];
    } catch (error) {
      console.error('Action item extraction failed:', error);
      return [];
    }
  }

  /**
   * Improve speaker identification using voice patterns and context
   */
  async improveSpeakerDiarization(segments: MeetingSegment[]): Promise<MeetingSegment[]> {
    try {
      const analysis = await this.analyzeSpeakers({ segments });
      
      return segments.map((segment, index) => {
        const speakerInfo = Object.entries(analysis.speakerMapping)
          .find(([_, info]) => info.segments.includes(index));
        
        if (speakerInfo) {
          return {
            ...segment,
            speaker: {
              ...segment.speaker,
              name: speakerInfo[1].name,
              id: speakerInfo[0]
            }
          };
        }
        
        return segment;
      });
    } catch (error) {
      console.error('Speaker diarization improvement failed:', error);
      return segments;
    }
  }

  private getTranscriptionPrompt(type: string): string {
    const basePrompt = `You are an expert transcription enhancer. Improve the quality and accuracy of voice transcriptions.`;
    
    switch (type) {
      case 'accuracy':
        return `${basePrompt} Focus on correcting misheard words and improving accuracy. Return JSON with: improvedTranscript, corrections, confidence.`;
      case 'punctuation':
        return `${basePrompt} Focus on adding proper punctuation and formatting. Return JSON with: improvedTranscript, confidence.`;
      case 'speaker_diarization':
        return `${basePrompt} Focus on identifying different speakers and their characteristics. Return JSON with: speakerIdentification, confidence.`;
      default:
        return `${basePrompt} Provide comprehensive enhancement including accuracy, punctuation, speaker identification, sentiment, and key points. Return JSON with all fields.`;
    }
  }

  private getMeetingAnalysisPrompt(type: string): string {
    const basePrompt = `You are an expert meeting analyst. Analyze meeting transcripts to extract valuable insights.`;
    
    switch (type) {
      case 'summary':
        return `${basePrompt} Focus on creating a comprehensive summary. Return JSON with: summary, keyTopics, confidence.`;
      case 'action_items':
        return `${basePrompt} Focus on extracting action items and next steps. Return JSON with: actionItems, nextSteps, confidence.`;
      case 'decisions':
        return `${basePrompt} Focus on identifying decisions made and their context. Return JSON with: decisions, confidence.`;
      case 'insights':
        return `${basePrompt} Focus on conversation insights and patterns. Return JSON with: insights, confidence.`;
      default:
        return `${basePrompt} Provide comprehensive analysis including summary, action items, decisions, and insights. Return JSON with all fields.`;
    }
  }

  private buildTranscriptionContext(request: EnhancedTranscriptionRequest): string {
    let context = `Enhance this transcription: "${request.rawTranscript}"`;
    
    if (request.speaker) {
      context += ` Speaker: ${request.speaker.name}`;
    }
    
    if (request.audioContext) {
      if (request.audioContext.meetingTitle) {
        context += ` Meeting: ${request.audioContext.meetingTitle}`;
      }
      if (request.audioContext.previousSegments?.length > 0) {
        context += ` Previous context: ${request.audioContext.previousSegments.join(' ')}`;
      }
    }
    
    return context;
  }

  private buildMeetingTranscript(meeting: Meeting): string {
    return meeting.segments
      .map(segment => {
        const timestamp = new Date(segment.timestamp).toLocaleTimeString();
        const speaker = segment.speaker?.name || 'Unknown';
        return `[${timestamp}] ${speaker}: ${segment.transcription}`;
      })
      .join('\n');
  }

  private calculateMeetingDuration(meeting: Meeting): string {
    const start = new Date(meeting.meetingStart);
    const end = new Date(meeting.meetingEnd);
    const durationMs = end.getTime() - start.getTime();
    const minutes = Math.round(durationMs / (1000 * 60));
    return `${minutes} minutes`;
  }

  private getPreviousMeetingContext(meeting: Meeting): string {
    // This would ideally fetch context from previous meetings
    // For now, return a placeholder
    return "No previous meeting context available";
  }

  private getDefaultTranscriptionResult(originalTranscript: string): EnhancedTranscriptionResult {
    return {
      improvedTranscript: originalTranscript,
      confidence: 0.5,
      corrections: [],
      speakerIdentification: {
        speakerId: "unknown",
        speakerName: "Unknown",
        confidence: 0
      },
      sentiment: "neutral",
      emotions: [],
      keyPoints: []
    };
  }

  private getDefaultMeetingResult(): MeetingAnalysisResult {
    return {
      summary: "Unable to analyze meeting",
      keyTopics: [],
      actionItems: [],
      decisions: [],
      insights: {
        participation: {},
        sentiment: {},
        topicFlow: [],
        recommendations: []
      },
      nextSteps: [],
      confidence: 0
    };
  }

  private getDefaultSpeakerResult(): SpeakerAnalysisResult {
    return {
      speakerMapping: {},
      conversationFlow: [],
      speakerInsights: {}
    };
  }

  private getDefaultRealTimeResult(): RealTimeAnalysisResult {
    return {
      liveSummary: "Unable to analyze current conversation",
      currentTopic: "Unknown",
      suggestedActions: [],
      conversationQuality: {
        clarity: 0.5,
        engagement: 0.5,
        productivity: 0.5
      },
      warnings: []
    };
  }
}

// Export singleton creator
export function createMeetingVoiceLLMService(settings: Settings): MeetingVoiceLLMService {
  return new MeetingVoiceLLMService(settings);
}

// Enhanced meeting utilities
export async function enhanceMeetingWithLLM(
  meeting: Meeting,
  settings: Settings,
  analysisType: 'full' | 'summary' | 'speakers' | 'actions' = 'full'
): Promise<Meeting> {
  const service = createMeetingVoiceLLMService(settings);
  
  try {
    switch (analysisType) {
      case 'full':
        const [analysis, improvedSegments] = await Promise.all([
          service.analyzeMeeting({ meeting, analysisType: 'full' }),
          service.improveSpeakerDiarization(meeting.segments)
        ]);
        
        return {
          ...meeting,
          aiSummary: analysis.summary,
          segments: improvedSegments,
          // Add enhanced data to meeting object
          enhancedAnalysis: analysis
        } as Meeting & { enhancedAnalysis: MeetingAnalysisResult };
        
      case 'summary':
        const summary = await service.generateSmartSummary(meeting, 'detailed');
        return { ...meeting, aiSummary: summary };
        
      case 'speakers':
        const enhancedSegments = await service.improveSpeakerDiarization(meeting.segments);
        return { ...meeting, segments: enhancedSegments };
        
      case 'actions':
        const actionItems = await service.extractActionItems(meeting);
        return {
          ...meeting,
          // Add action items to meeting (would need to extend Meeting type)
          actionItems
        } as Meeting & { actionItems: any[] };
        
      default:
        return meeting;
    }
  } catch (error) {
    console.error('Meeting enhancement failed:', error);
    return meeting;
  }
}

export async function generateMeetingInsights(
  meetings: Meeting[],
  settings: Settings
): Promise<{
  trends: string[];
  recommendations: string[];
  patterns: string[];
  participationAnalysis: Record<string, any>;
}> {
  const service = createMeetingVoiceLLMService(settings);
  
  try {
    const analyses = await Promise.all(
      meetings.map(meeting => service.analyzeMeeting({ meeting, analysisType: 'insights' }))
    );
    
    // Aggregate insights across meetings
    const allTopics = analyses.flatMap(a => a.keyTopics);
    const allParticipation = analyses.reduce((acc, a) => ({ ...acc, ...a.insights.participation }), {});
    
    return {
      trends: [...new Set(allTopics)],
      recommendations: analyses.flatMap(a => a.insights.recommendations),
      patterns: analyses.flatMap(a => a.insights.topicFlow),
      participationAnalysis: allParticipation
    };
  } catch (error) {
    console.error('Meeting insights generation failed:', error);
    return {
      trends: [],
      recommendations: [],
      patterns: [],
      participationAnalysis: {}
    };
  }
}