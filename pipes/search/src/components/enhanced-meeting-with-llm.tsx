/**
 * Enhanced Meeting Component with Voice LLM Integration
 * Provides intelligent meeting analysis with speaker identification and real-time insights
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/lib/use-toast';
import { 
  Mic, 
  MicOff, 
  Users, 
  Brain, 
  Play, 
  Pause, 
  MessageSquare,
  TrendingUp,
  Clock,
  Lightbulb,
  Target,
  FileText,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Settings } from '@screenpipe/browser';
import { 
  createMeetingVoiceLLMService,
  EnhancedTranscriptionResult,
  MeetingAnalysisResult,
  SpeakerIdentificationResult
} from '@/lib/meeting-voice-llm-service';

interface EnhancedMeetingProps {
  settings: Settings;
  onMeetingEnd?: (summary: MeetingAnalysisResult) => void;
}

interface Speaker {
  id: string;
  name?: string;
  voiceProfile: number[];
  confidence: number;
  speakingTime: number;
  segments: SpeakingSegment[];
}

interface SpeakingSegment {
  startTime: Date;
  endTime: Date;
  text: string;
  confidence: number;
  emotions?: string[];
  keyPoints?: string[];
  questions?: string[];
  actionItems?: string[];
}

interface MeetingState {
  isRecording: boolean;
  speakers: Speaker[];
  currentTranscript: string;
  realtimeInsights: {
    sentiment: 'positive' | 'neutral' | 'negative';
    energy: number;
    engagement: number;
    keyTopics: string[];
    actionItems: string[];
    questions: string[];
  };
  meetingAnalysis?: MeetingAnalysisResult;
  isAnalyzing: boolean;
  recordingDuration: number;
  audioLevel: number;
}

export function EnhancedMeetingWithLLM({ settings, onMeetingEnd }: EnhancedMeetingProps) {
  const { toast } = useToast();
  const [meetingState, setMeetingState] = useState<MeetingState>({
    isRecording: false,
    speakers: [],
    currentTranscript: '',
    realtimeInsights: {
      sentiment: 'neutral',
      energy: 0.5,
      engagement: 0.5,
      keyTopics: [],
      actionItems: [],
      questions: []
    },
    isAnalyzing: false,
    recordingDuration: 0,
    audioLevel: 0
  });

  const meetingLLMService = useRef(createMeetingVoiceLLMService(settings));
  const recordingTimer = useRef<NodeJS.Timeout>();
  const analysisTimer = useRef<NodeJS.Timeout>();
  const audioContext = useRef<AudioContext>();
  const analyser = useRef<AnalyserNode>();

  // Initialize audio monitoring
  useEffect(() => {
    return () => {
      recordingTimer.current && clearInterval(recordingTimer.current);
      analysisTimer.current && clearInterval(analysisTimer.current);
      audioContext.current?.close();
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      // Initialize audio context for real-time monitoring
      audioContext.current = new AudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const source = audioContext.current.createMediaStreamSource(stream);
      analyser.current = audioContext.current.createAnalyser();
      analyser.current.fftSize = 256;
      source.connect(analyser.current);

      setMeetingState(prev => ({ 
        ...prev, 
        isRecording: true,
        recordingDuration: 0,
        speakers: [],
        currentTranscript: '',
        realtimeInsights: {
          sentiment: 'neutral',
          energy: 0.5,
          engagement: 0.5,
          keyTopics: [],
          actionItems: [],
          questions: []
        }
      }));

      // Start recording timer
      recordingTimer.current = setInterval(() => {
        setMeetingState(prev => ({ 
          ...prev, 
          recordingDuration: prev.recordingDuration + 1 
        }));
        
        // Update audio level
        if (analyser.current) {
          const dataArray = new Uint8Array(analyser.current.frequencyBinCount);
          analyser.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setMeetingState(prev => ({ ...prev, audioLevel: average / 255 }));
        }
      }, 1000);

      // Start real-time analysis
      analysisTimer.current = setInterval(() => {
        performRealtimeAnalysis();
      }, 10000); // Analyze every 10 seconds

      toast({
        title: "Recording Started",
        description: "Meeting analysis with voice LLM is now active",
      });

    } catch (error) {
      console.error('Failed to start recording:', error);
      toast({
        title: "Recording Failed",
        description: "Please check your microphone permissions",
        variant: "destructive"
      });
    }
  }, []);

  const stopRecording = useCallback(async () => {
    recordingTimer.current && clearInterval(recordingTimer.current);
    analysisTimer.current && clearInterval(analysisTimer.current);
    audioContext.current?.close();

    setMeetingState(prev => ({ ...prev, isRecording: false, isAnalyzing: true }));

    try {
      // Perform final meeting analysis
      const finalAnalysis = await performFinalAnalysis();
      
      setMeetingState(prev => ({ 
        ...prev, 
        isAnalyzing: false,
        meetingAnalysis: finalAnalysis 
      }));

      onMeetingEnd?.(finalAnalysis);

      toast({
        title: "Meeting Analysis Complete",
        description: "Your meeting has been analyzed with AI insights",
      });

    } catch (error) {
      console.error('Failed to analyze meeting:', error);
      setMeetingState(prev => ({ ...prev, isAnalyzing: false }));
      toast({
        title: "Analysis Failed",
        description: "Please try again",
        variant: "destructive"
      });
    }
  }, [meetingState.speakers, meetingState.currentTranscript]);

  const performRealtimeAnalysis = useCallback(async () => {
    if (!meetingState.isRecording || meetingState.speakers.length === 0) return;

    try {
      // Get recent transcription data
      const recentTranscripts = meetingState.speakers
        .flatMap(speaker => speaker.segments)
        .filter(segment => {
          const timeDiff = Date.now() - segment.startTime.getTime();
          return timeDiff < 30000; // Last 30 seconds
        });

      if (recentTranscripts.length === 0) return;

      // Enhance transcription with LLM
      const enhancement = await meetingLLMService.current.enhanceTranscription({
        rawTranscript: recentTranscripts.map(t => t.text).join(' '),
        speakerContext: meetingState.speakers.map(s => ({
          id: s.id,
          name: s.name,
          voiceProfile: s.voiceProfile
        })),
        timeframe: { start: new Date(Date.now() - 30000), end: new Date() }
      });

      // Update real-time insights
      setMeetingState(prev => ({
        ...prev,
        realtimeInsights: {
          sentiment: determineSentiment(enhancement.emotions),
          energy: calculateEnergyLevel(enhancement.confidence),
          engagement: calculateEngagementLevel(enhancement.speakerChanges),
          keyTopics: enhancement.keyPoints.slice(0, 5),
          actionItems: enhancement.actionItems.slice(0, 3),
          questions: enhancement.questions.slice(0, 3)
        }
      }));

    } catch (error) {
      console.error('Real-time analysis failed:', error);
    }
  }, [meetingState.isRecording, meetingState.speakers]);

  const performFinalAnalysis = async (): Promise<MeetingAnalysisResult> => {
    const allTranscripts = meetingState.speakers
      .flatMap(speaker => speaker.segments)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    const meetingData = {
      participants: meetingState.speakers.map(s => ({
        id: s.id,
        name: s.name || `Speaker ${s.id}`,
        speakingTime: s.speakingTime,
        voiceProfile: s.voiceProfile
      })),
      transcript: allTranscripts.map(t => ({
        speakerId: meetingState.speakers.find(s => 
          s.segments.includes(t)
        )?.id || 'unknown',
        text: t.text,
        timestamp: t.startTime,
        confidence: t.confidence
      })),
      duration: meetingState.recordingDuration,
      startTime: new Date(Date.now() - meetingState.recordingDuration * 1000)
    };

    return await meetingLLMService.current.analyzeMeeting(meetingData);
  };

  // Helper functions
  const determineSentiment = (emotions: string[]): 'positive' | 'neutral' | 'negative' => {
    const positiveEmotions = emotions.filter(e => 
      ['happy', 'excited', 'confident', 'enthusiastic'].includes(e.toLowerCase())
    );
    const negativeEmotions = emotions.filter(e => 
      ['frustrated', 'angry', 'concerned', 'disappointed'].includes(e.toLowerCase())
    );

    if (positiveEmotions.length > negativeEmotions.length) return 'positive';
    if (negativeEmotions.length > positiveEmotions.length) return 'negative';
    return 'neutral';
  };

  const calculateEnergyLevel = (confidence: number): number => {
    // Simple energy calculation based on confidence and audio level
    return Math.min(1, (confidence + meetingState.audioLevel) / 2);
  };

  const calculateEngagementLevel = (speakerChanges: number): number => {
    // More speaker changes often indicate higher engagement
    return Math.min(1, speakerChanges / 10);
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'text-green-600 bg-green-50';
      case 'negative': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const exportMeetingSummary = () => {
    if (!meetingState.meetingAnalysis) return;

    const summary = {
      meeting: {
        duration: formatDuration(meetingState.recordingDuration),
        participants: meetingState.speakers.length,
        timestamp: new Date().toISOString()
      },
      analysis: meetingState.meetingAnalysis,
      insights: meetingState.realtimeInsights
    };

    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-summary-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Meeting Control Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-green-500" />
            AI-Enhanced Meeting
            <Badge variant={meetingState.isRecording ? "default" : "outline"} className="ml-auto">
              {meetingState.isRecording ? 'Recording' : 'Stopped'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Recording Controls */}
          <div className="flex items-center gap-4">
            <Button
              size="lg"
              onClick={meetingState.isRecording ? stopRecording : startRecording}
              disabled={meetingState.isAnalyzing}
              className={meetingState.isRecording ? 'bg-red-500 hover:bg-red-600' : ''}
            >
              {meetingState.isRecording ? (
                <>
                  <MicOff className="h-4 w-4 mr-2" />
                  Stop Recording
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4 mr-2" />
                  Start Recording
                </>
              )}
            </Button>

            {meetingState.isRecording && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-500" />
                <span className="font-mono text-lg">
                  {formatDuration(meetingState.recordingDuration)}
                </span>
                
                {/* Audio Level Indicator */}
                <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 transition-all duration-100"
                    style={{ width: `${meetingState.audioLevel * 100}%` }}
                  />
                </div>
              </div>
            )}

            {meetingState.meetingAnalysis && (
              <Button variant="outline" onClick={exportMeetingSummary}>
                <Download className="h-4 w-4 mr-2" />
                Export Summary
              </Button>
            )}
          </div>

          {/* Meeting Stats */}
          {meetingState.isRecording && (
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <Users className="h-6 w-6 mx-auto text-blue-500 mb-1" />
                <div className="text-xl font-bold">{meetingState.speakers.length}</div>
                <div className="text-xs text-gray-500">Speakers</div>
              </div>
              
              <div className="text-center">
                <TrendingUp className="h-6 w-6 mx-auto text-purple-500 mb-1" />
                <div className="text-xl font-bold">
                  {Math.round(meetingState.realtimeInsights.energy * 100)}%
                </div>
                <div className="text-xs text-gray-500">Energy</div>
              </div>
              
              <div className="text-center">
                <MessageSquare className="h-6 w-6 mx-auto text-orange-500 mb-1" />
                <div className="text-xl font-bold">
                  {Math.round(meetingState.realtimeInsights.engagement * 100)}%
                </div>
                <div className="text-xs text-gray-500">Engagement</div>
              </div>
              
              <div className="text-center">
                <div className={`h-6 w-6 mx-auto mb-1 rounded-full flex items-center justify-center text-xs font-bold ${getSentimentColor(meetingState.realtimeInsights.sentiment)}`}>
                  {meetingState.realtimeInsights.sentiment.charAt(0).toUpperCase()}
                </div>
                <div className="text-xl font-bold capitalize">
                  {meetingState.realtimeInsights.sentiment}
                </div>
                <div className="text-xs text-gray-500">Sentiment</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analysis Progress */}
      {meetingState.isAnalyzing && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Analyzing meeting with voice LLM...</span>
                <span>Processing</span>
              </div>
              <Progress value={undefined} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Real-time Insights */}
      {meetingState.isRecording && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Key Topics */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4 text-blue-500" />
                Key Topics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {meetingState.realtimeInsights.keyTopics.length > 0 ? (
                meetingState.realtimeInsights.keyTopics.map((topic, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {topic}
                  </Badge>
                ))
              ) : (
                <p className="text-xs text-gray-500">Listening for topics...</p>
              )}
            </CardContent>
          </Card>

          {/* Action Items */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Lightbulb className="h-4 w-4 text-yellow-500" />
                Action Items
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {meetingState.realtimeInsights.actionItems.length > 0 ? (
                meetingState.realtimeInsights.actionItems.map((item, index) => (
                  <p key={index} className="text-xs text-gray-600">
                    • {item}
                  </p>
                ))
              ) : (
                <p className="text-xs text-gray-500">No action items yet...</p>
              )}
            </CardContent>
          </Card>

          {/* Questions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <MessageSquare className="h-4 w-4 text-green-500" />
                Questions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {meetingState.realtimeInsights.questions.length > 0 ? (
                meetingState.realtimeInsights.questions.map((question, index) => (
                  <p key={index} className="text-xs text-gray-600">
                    ? {question}
                  </p>
                ))
              ) : (
                <p className="text-xs text-gray-500">No questions identified...</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Speaker Analysis */}
      {meetingState.speakers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              Speaker Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {meetingState.speakers.map((speaker) => (
                <div key={speaker.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">
                      {speaker.name || `Speaker ${speaker.id}`}
                    </h4>
                    <Badge variant="outline" className="text-xs">
                      {formatDuration(speaker.speakingTime)} speaking
                    </Badge>
                  </div>
                  
                  <div className="text-xs text-gray-600 space-y-1">
                    <div>Confidence: {(speaker.confidence * 100).toFixed(0)}%</div>
                    <div>Segments: {speaker.segments.length}</div>
                  </div>

                  {speaker.segments.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 italic">
                        Latest: "{speaker.segments[speaker.segments.length - 1]?.text.slice(0, 100)}..."
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Final Meeting Analysis */}
      {meetingState.meetingAnalysis && (
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700">
              <FileText className="h-5 w-5" />
              Meeting Summary
              <Badge variant="secondary" className="ml-auto">
                AI Generated
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary */}
            <div>
              <h4 className="font-medium text-green-700 mb-2">Summary</h4>
              <p className="text-sm text-green-600">
                {meetingState.meetingAnalysis.summary}
              </p>
            </div>

            {/* Key Decisions */}
            {meetingState.meetingAnalysis.keyDecisions.length > 0 && (
              <div>
                <h4 className="font-medium text-green-700 mb-2">Key Decisions</h4>
                <ul className="space-y-1">
                  {meetingState.meetingAnalysis.keyDecisions.map((decision, index) => (
                    <li key={index} className="text-sm text-green-600 flex items-start gap-1">
                      <span className="mt-1 block w-1 h-1 bg-green-400 rounded-full" />
                      {decision}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Items */}
            {meetingState.meetingAnalysis.actionItems.length > 0 && (
              <div>
                <h4 className="font-medium text-green-700 mb-2">Action Items</h4>
                <ul className="space-y-1">
                  {meetingState.meetingAnalysis.actionItems.map((item, index) => (
                    <li key={index} className="text-sm text-green-600 flex items-start gap-1">
                      <span className="mt-1 block w-1 h-1 bg-green-400 rounded-full" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Participant Insights */}
            {meetingState.meetingAnalysis.participantInsights.length > 0 && (
              <div>
                <h4 className="font-medium text-green-700 mb-2">Participant Insights</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {meetingState.meetingAnalysis.participantInsights.map((insight, index) => (
                    <div key={index} className="text-xs border border-green-200 rounded p-2">
                      <div className="font-medium">{insight.participantName}</div>
                      <div className="text-green-600">{insight.insights}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Live Transcript */}
      {meetingState.isRecording && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-red-500" />
              Live Transcript
              <Badge variant="outline" className="ml-auto">
                Real-time
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={meetingState.currentTranscript}
              readOnly
              className="min-h-32 resize-none"
              placeholder="Transcript will appear here as you speak..."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default EnhancedMeetingWithLLM;