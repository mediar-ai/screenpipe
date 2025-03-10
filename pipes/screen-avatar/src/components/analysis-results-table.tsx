type AnalysisResult = {
    timestamp: number
    fun_activity_detected: string
    confidence: string
    detected_apps: string[]
    reasoning: string
    duration: number
  }
  
  interface AnalysisResultsTableProps {
    results: AnalysisResult[]
  }
  
  export function AnalysisResultsTable({ results }: AnalysisResultsTableProps) {
    if (results.length === 0) return null
  
    return (
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Time</th>
              <th className="text-left p-2">Fun?</th>
              <th className="text-left p-2">Confidence</th>
              <th className="text-left p-2">Apps</th>
              <th className="text-left p-2">Reasoning</th>
              <th className="text-left p-2">Duration</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.timestamp} className="border-b">
                <td className="p-2">{new Date(result.timestamp).toLocaleTimeString()}</td>
                <td className="p-2">{result.fun_activity_detected}</td>
                <td className="p-2">{result.confidence}</td>
                <td className="p-2">{result.detected_apps.join(', ')}</td>
                <td className="p-2">{result.reasoning}</td>
                <td className="p-2">{result.duration}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }