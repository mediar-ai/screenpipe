interface ChunkOverlayProps {
    timestamp: string
    speaker?: string
    displaySpeaker: string
    onSpeakerClick: () => void
    onGenerateNote: () => void
}

export function ChunkOverlay({
    timestamp,
    speaker,
    displaySpeaker,
    onSpeakerClick,
    onGenerateNote
}: ChunkOverlayProps) {
    const formatSpeaker = (speaker: string | number) => {
        return typeof speaker === 'number' ? `speaker ${speaker}` : speaker
    }

    return (
        <div className="absolute -left-1 -top-5 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 px-1.5 py-0.5 rounded text-xs text-gray-500 z-10 pointer-events-none">
            {new Date(timestamp).toLocaleTimeString()}
            {speaker !== undefined && (
                <button
                    onClick={onSpeakerClick}
                    className="ml-1 px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 rounded-sm transition-colors pointer-events-auto"
                >
                    {formatSpeaker(displaySpeaker)}
                </button>
            )}
            <button
                onClick={(e) => {
                    e.stopPropagation()
                    onGenerateNote()
                }}
                className="ml-1 px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 rounded-sm transition-colors pointer-events-auto"
            >
                generate note
            </button>
        </div>
    )
} 