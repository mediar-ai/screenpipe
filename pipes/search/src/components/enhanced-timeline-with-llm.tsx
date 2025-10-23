/**
 * Enhanced Timeline Component with LLM Integration
 * Provides intelligent timeline analysis with video and voice understanding
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/lib/use-toast';
import { 
  Calendar, 
  Clock, 
  Activity, 
  Brain, 
  Video, 
  Mic, 
  TrendingUp,
  Filter,
  Zap,
  Eye,
  MessageSquare,
  BarChart3
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Settings, StreamTimeSeriesResponse } from '@screenpipe/browser';
import { 
  createTimelineLLMService,
  TimelineAnalysisResult,
  ActivityDetectionResult,
  SmartNavigationResult
} from '@/lib/timeline-llm-service';

interface EnhancedTimelineProps {
  settings: Settings;
  timeRange: { start: Date; end: Date };
  onTimelineSegmentSelect?: (segment: TimelineSegment) => void;
}

interface TimelineSegment {
  id: string;
  startTime: Date;
  endTime: Date;
  type: 'video' | 'audio' | 'activity' | 'meeting';
  title: string;
  description: string;
  confidence: number;
  keyInsights: string[];
  activities: DetectedActivity[];
  content: {
    frames?: any[];
    transcripts?: any[];
    metadata: Record<string, any>;
  };
  llmAnalysis?: TimelineAnalysisResult;
}

interface DetectedActivity {
  type: 'coding' | 'meeting' | 'browsing' | 'writing' | 'research' | 'debugging' | 'other';
  confidence: number;
  duration: number;
  description: string;
  keyMoments: string[];
}

interface TimelineState {
  segments: TimelineSegment[];
  isAnalyzing: boolean;
  analysisProgress: number;
  smartInsights?: {
    productivityPatterns: string[];
    keyMoments: Array<{ time: Date; description: string; importance: number }>;
    recommendations: string[];
    focusBlocks: Array<{ start: Date; end: Date; activity: string; quality: number }>;
  };
  selectedSegment?: TimelineSegment;
  filters: {
    activityTypes: string[];
    minConfidence: number;
    showOnlyImportant: boolean;
  };
}

export function EnhancedTimelineWithLLM({ 
  settings, 
  timeRange, 
  onTimelineSegmentSelect 
}: EnhancedTimelineProps) {
  const { toast } = useToast();
  const [timelineState, setTimelineState] = useState<TimelineState>({
    segments: [],
    isAnalyzing: false,
    analysisProgress: 0,
    filters: {
      activityTypes: ['coding', 'meeting', 'research', 'writing'],
      minConfidence: 0.6,
      showOnlyImportant: false
    }
  });

  const timelineLLMService = useRef(createTimelineLLMService(settings));
  const abortController = useRef<AbortController>();

  // Initialize timeline analysis on mount
  useEffect(() => {
    analyzeTimeline();
    return () => {
      abortController.current?.abort();
    };
  }, [timeRange]);

  const analyzeTimeline = useCallback(async () => {
    abortController.current?.abort();
    abortController.current = new AbortController();

    setTimelineState(prev => ({ 
      ...prev, 
      isAnalyzing: true, 
      analysisProgress: 0,
      segments: [],
      smartInsights: undefined 
    }));

    try {
      // Step 1: Fetch raw timeline data
      setTimelineState(prev => ({ ...prev, analysisProgress: 10 }));
      const rawTimelineData = await fetchTimelineData(timeRange);

      // Step 2: Segment the timeline into meaningful chunks
      setTimelineState(prev => ({ ...prev, analysisProgress: 30 }));
      const segments = await segmentTimeline(rawTimelineData);

      // Step 3: Analyze each segment with LLM
      setTimelineState(prev => ({ ...prev, analysisProgress: 50 }));
      const enhancedSegments = await enhanceSegmentsWithLLM(segments);

      // Step 4: Generate smart insights
      setTimelineState(prev => ({ ...prev, analysisProgress: 80 }));
      const insights = await generateSmartInsights(enhancedSegments);

      setTimelineState(prev => ({
        ...prev,
        isAnalyzing: false,
        analysisProgress: 100,
        segments: enhancedSegments,
        smartInsights: insights
      }));

      toast({
        title: "Timeline Analysis Complete",
        description: `Analyzed ${enhancedSegments.length} segments with AI insights`,
      });

    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Timeline analysis failed:', error);
        setTimelineState(prev => ({ ...prev, isAnalyzing: false }));
        toast({
          title: "Analysis Failed",
          description: "Please try again",
          variant: "destructive"
        });
      }
    }
  }, [timeRange]);

  const fetchTimelineData = async (range: { start: Date; end: Date }): Promise<StreamTimeSeriesResponse[]> => {
    // This would integrate with Screenpipe's timeline API
    // For demonstration, returning mock data
    const mockData: StreamTimeSeriesResponse[] = [];
    
    const current = new Date(range.start);
    const end = new Date(range.end);
    
    while (current < end) {
      mockData.push({
        timestamp: current.toISOString(),
        devices: [{
          deviceId: 'main',
          audio: [{
            transcription: 'Sample audio transcription for timeline analysis',
            deviceName: 'Default Audio Device',
            isInput: false
          }],
          vision: [{
            ocrText: 'Sample OCR text from screen capture',
            appName: 'VS Code',
            windowName: 'timeline-component.tsx',
            imageData: 'base64_image_data_here'
          }]
        }]
      });
      
      current.setMinutes(current.getMinutes() + 5);
    }
    
    return mockData;
  };

  const segmentTimeline = async (data: StreamTimeSeriesResponse[]): Promise<TimelineSegment[]> => {
    const segments: TimelineSegment[] = [];
    let currentSegment: Partial<TimelineSegment> | null = null;
    
    for (let i = 0; i < data.length; i++) {
      const entry = data[i];
      const timestamp = new Date(entry.timestamp);
      
      // Detect activity changes to create segments
      const activities = detectBasicActivities(entry);
      
      if (!currentSegment || shouldStartNewSegment(currentSegment, activities)) {
        // Finish previous segment
        if (currentSegment) {
          currentSegment.endTime = timestamp;
          segments.push(currentSegment as TimelineSegment);
        }
        
        // Start new segment
        currentSegment = {
          id: `segment-${segments.length}`,
          startTime: timestamp,
          endTime: timestamp,
          type: determineSegmentType(activities),
          title: generateSegmentTitle(activities),
          description: '',
          confidence: 0.5,
          keyInsights: [],
          activities,
          content: {
            frames: entry.devices[0]?.vision || [],
            transcripts: entry.devices[0]?.audio || [],
            metadata: { activityTypes: activities.map(a => a.type) }
          }
        };
      } else {
        // Extend current segment
        currentSegment.endTime = timestamp;
        currentSegment.content.frames?.push(...(entry.devices[0]?.vision || []));
        currentSegment.content.transcripts?.push(...(entry.devices[0]?.audio || []));
        currentSegment.activities = mergeActivities(currentSegment.activities!, activities);
      }
    }
    
    // Finish last segment
    if (currentSegment) {
      segments.push(currentSegment as TimelineSegment);
    }
    
    return segments;
  };

  const enhanceSegmentsWithLLM = async (segments: TimelineSegment[]): Promise<TimelineSegment[]> => {
    const enhanced: TimelineSegment[] = [];
    
    for (let i = 0; i < segments.length; i++) {
      setTimelineState(prev => ({ 
        ...prev, 
        analysisProgress: 50 + (i / segments.length) * 30 
      }));
      
      try {
        const segment = segments[i];
        
        // Analyze segment with LLM
        const analysis = await timelineLLMService.current.analyzeTimelineSegment({
          startTime: segment.startTime,
          endTime: segment.endTime,
          videoFrames: segment.content.frames || [],
          audioTranscripts: segment.content.transcripts || [],
          metadata: segment.content.metadata
        });
        
        // Detect activities with LLM
        const activityDetection = await timelineLLMService.current.detectActivities({
          timeRange: { start: segment.startTime, end: segment.endTime },
          content: segment.content,
          confidenceThreshold: timelineState.filters.minConfidence
        });
        
        enhanced.push({
          ...segment,
          title: analysis.insights.title || segment.title,
          description: analysis.insights.summary || segment.description,
          confidence: analysis.insights.confidence,
          keyInsights: analysis.insights.keyMoments,
          activities: activityDetection.activities,
          llmAnalysis: analysis
        });
        
      } catch (error) {
        console.error(`Failed to enhance segment ${segment.id}:`, error);
        enhanced.push(segment);
      }
    }
    
    return enhanced;
  };

  const generateSmartInsights = async (segments: TimelineSegment[]) => {
    try {
      const navigation = await timelineLLMService.current.generateSmartNavigation({
        segments: segments.map(s => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          activities: s.activities,
          confidence: s.confidence
        })),
        timeRange
      });
      
      // Process navigation insights into UI-friendly format
      return {
        productivityPatterns: navigation.insights.patterns,
        keyMoments: navigation.insights.keyMoments.map(moment => ({
          time: new Date(moment.timestamp),
          description: moment.description,
          importance: moment.importance
        })),
        recommendations: navigation.insights.recommendations,
        focusBlocks: navigation.insights.patterns
          .filter(p => p.includes('focus') || p.includes('productive'))
          .map((pattern, index) => ({
            start: segments[index]?.startTime || timeRange.start,
            end: segments[index]?.endTime || timeRange.end,
            activity: pattern,
            quality: 0.8
          }))
      };
    } catch (error) {
      console.error('Failed to generate smart insights:', error);
      return undefined;
    }
  };

  // Helper functions
  const detectBasicActivities = (entry: StreamTimeSeriesResponse): DetectedActivity[] => {
    const activities: DetectedActivity[] = [];
    
    entry.devices.forEach(device => {
      device.vision?.forEach(vision => {
        if (vision.appName === 'VS Code' || vision.appName === 'WebStorm') {
          activities.push({
            type: 'coding',
            confidence: 0.8,
            duration: 5,
            description: `Coding in ${vision.appName}`,
            keyMoments: [vision.ocrText?.slice(0, 50) || '']
          });
        } else if (vision.appName?.includes('Zoom') || vision.appName?.includes('Teams')) {
          activities.push({
            type: 'meeting',
            confidence: 0.9,
            duration: 5,
            description: `Meeting in ${vision.appName}`,
            keyMoments: []
          });
        }
      });
      
      device.audio?.forEach(audio => {
        if (audio.transcription?.includes('meeting') || audio.transcription?.includes('call')) {
          activities.push({
            type: 'meeting',
            confidence: 0.7,
            duration: 5,
            description: 'Audio from meeting',
            keyMoments: [audio.transcription.slice(0, 50)]
          });
        }
      });
    });
    
    return activities;
  };

  const shouldStartNewSegment = (current: Partial<TimelineSegment>, activities: DetectedActivity[]): boolean => {
    if (!current.activities) return true;
    
    const currentTypes = current.activities.map(a => a.type);
    const newTypes = activities.map(a => a.type);
    
    // Start new segment if activity types changed significantly
    return newTypes.some(type => !currentTypes.includes(type));
  };

  const determineSegmentType = (activities: DetectedActivity[]): 'video' | 'audio' | 'activity' | 'meeting' => {
    if (activities.some(a => a.type === 'meeting')) return 'meeting';
    if (activities.some(a => a.type === 'coding')) return 'activity';
    return 'activity';
  };

  const generateSegmentTitle = (activities: DetectedActivity[]): string => {
    if (activities.length === 0) return 'Unknown Activity';
    
    const primaryActivity = activities.reduce((prev, current) => 
      current.confidence > prev.confidence ? current : prev
    );
    
    return primaryActivity.description;
  };

  const mergeActivities = (existing: DetectedActivity[], newActivities: DetectedActivity[]): DetectedActivity[] => {
    const merged = [...existing];
    
    newActivities.forEach(newActivity => {
      const existingIndex = merged.findIndex(a => a.type === newActivity.type);
      if (existingIndex >= 0) {
        merged[existingIndex].duration += newActivity.duration;
        merged[existingIndex].keyMoments.push(...newActivity.keyMoments);
      } else {
        merged.push(newActivity);
      }
    });
    
    return merged;
  };

  const handleSegmentClick = (segment: TimelineSegment) => {
    setTimelineState(prev => ({ ...prev, selectedSegment: segment }));
    onTimelineSegmentSelect?.(segment);
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'coding': return <Activity className="h-4 w-4" />;
      case 'meeting': return <MessageSquare className="h-4 w-4" />;
      case 'research': return <Eye className="h-4 w-4" />;
      case 'writing': return <MessageSquare className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const filteredSegments = timelineState.segments.filter(segment => {
    if (segment.confidence < timelineState.filters.minConfidence) return false;
    if (timelineState.filters.showOnlyImportant && segment.confidence < 0.8) return false;
    
    const hasMatchingActivity = segment.activities.some(activity =>
      timelineState.filters.activityTypes.includes(activity.type)
    );
    
    return hasMatchingActivity;
  });

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Enhanced Timeline Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-500" />
            AI-Enhanced Timeline
            <Badge variant="outline" className="ml-auto">
              {filteredSegments.length} segments
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Time Range Display */}
          <div className="flex items-center gap-4">
            <Calendar className="h-4 w-4 text-gray-500" />
            <span className="text-sm">
              {timeRange.start.toLocaleString()} - {timeRange.end.toLocaleString()}
            </span>
            <Button
              size="sm"
              onClick={analyzeTimeline}
              disabled={timelineState.isAnalyzing}
            >
              <Zap className="h-3 w-3 mr-1" />
              Re-analyze
            </Button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            
            <div className="flex gap-2">
              {['coding', 'meeting', 'research', 'writing'].map(type => (
                <Button
                  key={type}
                  variant={timelineState.filters.activityTypes.includes(type) ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setTimelineState(prev => ({
                      ...prev,
                      filters: {
                        ...prev.filters,
                        activityTypes: prev.filters.activityTypes.includes(type)
                          ? prev.filters.activityTypes.filter(t => t !== type)
                          : [...prev.filters.activityTypes, type]
                      }
                    }));
                  }}
                >
                  {getActivityIcon(type)}
                  <span className="ml-1 capitalize">{type}</span>
                </Button>
              ))}
            </div>

            <Button
              variant={timelineState.filters.showOnlyImportant ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setTimelineState(prev => ({
                  ...prev,
                  filters: {
                    ...prev.filters,
                    showOnlyImportant: !prev.filters.showOnlyImportant
                  }
                }));
              }}
            >
              <TrendingUp className="h-3 w-3 mr-1" />
              Important Only
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Analysis Progress */}
      {timelineState.isAnalyzing && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Analyzing timeline with AI...</span>
                <span>{timelineState.analysisProgress}%</span>
              </div>
              <Progress value={timelineState.analysisProgress} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Smart Insights */}
      {timelineState.smartInsights && (
        <Card className="border-purple-200 bg-purple-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-purple-700">
              <BarChart3 className="h-4 w-4" />
              Smart Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Productivity Patterns */}
            {timelineState.smartInsights.productivityPatterns.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-purple-700">Productivity Patterns:</h4>
                <div className="space-y-1">
                  {timelineState.smartInsights.productivityPatterns.map((pattern, index) => (
                    <p key={index} className="text-xs text-purple-600">• {pattern}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Key Moments */}
            {timelineState.smartInsights.keyMoments.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-purple-700">Key Moments:</h4>
                <div className="space-y-1">
                  {timelineState.smartInsights.keyMoments
                    .sort((a, b) => b.importance - a.importance)
                    .slice(0, 3)
                    .map((moment, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {moment.time.toLocaleTimeString()}
                        </Badge>
                        <p className="text-xs text-purple-600 flex-1">{moment.description}</p>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}

            {/* Recommendations */}
            {timelineState.smartInsights.recommendations.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-purple-700">Recommendations:</h4>
                <div className="space-y-1">
                  {timelineState.smartInsights.recommendations.slice(0, 2).map((rec, index) => (
                    <p key={index} className="text-xs text-purple-600">💡 {rec}</p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Timeline Segments */}
      {filteredSegments.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Timeline Segments</h3>
          
          <div className="space-y-3">
            <AnimatePresence>
              {filteredSegments.map((segment, index) => (
                <motion.div
                  key={segment.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card 
                    className={`cursor-pointer transition-all duration-200 ${
                      timelineState.selectedSegment?.id === segment.id 
                        ? 'ring-2 ring-purple-500 shadow-md' 
                        : 'hover:shadow-sm'
                    }`}
                    onClick={() => handleSegmentClick(segment)}
                  >
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        {/* Segment Type Icon */}
                        <div className="flex-shrink-0">
                          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                            {segment.type === 'video' && <Video className="h-5 w-5 text-blue-500" />}
                            {segment.type === 'audio' && <Mic className="h-5 w-5 text-green-500" />}
                            {segment.type === 'meeting' && <MessageSquare className="h-5 w-5 text-orange-500" />}
                            {segment.type === 'activity' && <Activity className="h-5 w-5 text-purple-500" />}
                          </div>
                        </div>

                        {/* Segment Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-medium text-sm truncate">
                              {segment.title}
                            </h4>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Badge 
                                variant={segment.confidence > 0.7 ? "default" : "secondary"}
                                className={`text-xs ${getConfidenceColor(segment.confidence)}`}
                              >
                                {(segment.confidence * 100).toFixed(0)}%
                              </Badge>
                              {segment.llmAnalysis && (
                                <Badge variant="secondary" className="text-xs">
                                  <Brain className="h-3 w-3 mr-1" />
                                  AI
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                            {segment.description}
                          </p>

                          {/* Time Range */}
                          <div className="flex items-center gap-2 mt-2">
                            <Clock className="h-3 w-3 text-gray-400" />
                            <span className="text-xs text-gray-500">
                              {segment.startTime.toLocaleTimeString()} - {segment.endTime.toLocaleTimeString()}
                            </span>
                            <span className="text-xs text-gray-400">
                              ({Math.round((segment.endTime.getTime() - segment.startTime.getTime()) / 60000)}m)
                            </span>
                          </div>

                          {/* Activities */}
                          {segment.activities.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {segment.activities.slice(0, 3).map((activity, actIndex) => (
                                <Badge key={actIndex} variant="outline" className="text-xs">
                                  {getActivityIcon(activity.type)}
                                  <span className="ml-1 capitalize">{activity.type}</span>
                                </Badge>
                              ))}
                              {segment.activities.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{segment.activities.length - 3} more
                                </Badge>
                              )}
                            </div>
                          )}

                          {/* Key Insights */}
                          {segment.keyInsights.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-gray-500 italic">
                                "{segment.keyInsights[0]}"
                              </p>
                            </div>
                          )}
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
      {!timelineState.isAnalyzing && filteredSegments.length === 0 && timelineState.segments.length > 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <Filter className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-500 mb-2">No segments match your filters</h3>
            <p className="text-sm text-gray-400">
              Try adjusting your filters or reducing the minimum confidence
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default EnhancedTimelineWithLLM;