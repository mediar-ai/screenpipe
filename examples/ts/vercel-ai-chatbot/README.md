
this is a copy of https://github.com/vercel/ai-chatbot 

i just added in `lib/chat/actions.tsx` a tool to call screenpipe api (in the tools list):

```ts
queryScreenpipeAPI: {
  description:
    'Query the Screenpipe API for OCR that appeared on user s screen and audio transcriptions from his mic',
  parameters: z.object({
    query: z.string().describe('The search query which match exact keywords. Try to use a single keyword that would match the user intent'),
    contentType: z
      .enum(['ocr', 'audio'])
      .describe('The type of content to search for'),
    limit: z
      .number()
      .optional()
      .describe('The number of results to return (default: 5)'),
    offset: z
      .number()
      .optional()
      .describe('The offset for pagination (default: 0)')
  }),
  generate: async function* ({
    query,
    contentType,
    limit = 5,
    offset = 0
  }) {
    console.log("screenpipe-chatbot will use content type: ", contentType)
    console.log("screenpipe-chatbot will use query: ", query)
    console.log("screenpipe-chatbot will use limit: ", limit)
    console.log("screenpipe-chatbot will use offset: ", offset)
    yield (
      <BotCard>
        <div className="inline-flex items-start gap-1 md:items-center">
          {spinner}
          <p className="mb-2">Searching for {contentType} content...</p>
        </div>
      </BotCard>
    )

    try {
      const response = await fetch(
        `http://localhost:3030/search?q=${encodeURIComponent(query)}&content_type=${contentType}&limit=${limit}&offset=${offset}`
      )

      if (!response.ok) {
        throw new Error(
          `API request failed with status ${response.status}`
        )
      }

      const data = await response.json()

      const toolCallId = nanoid()

      aiState.done({
        ...aiState.get(),
        messages: [
          ...aiState.get().messages,
          {
            id: nanoid(),
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'queryScreenpipeAPI',
                toolCallId,
                args: { query, contentType, limit, offset }
              }
            ]
          },
          {
            id: nanoid(),
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolName: 'queryScreenpipeAPI',
                toolCallId,
                result: data
              }
            ]
          }
        ]
      })

      return (
        <BotCard>
          <div>
            <h3 className="text-lg font-semibold mb-2">
              Search Results ({contentType}):
            </h3>
            <ul className="list-disc pl-5">
              {data.data.map((item: any, index: number) => (
                <li key={index} className="mb-2">
                  <p>
                    <strong>{item.content.timestamp}</strong>:{' '}
                    {item.content.text || item.content.transcription}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-2">Total results: {data.pagination.total}</p>
          </div>
        </BotCard>
      )
    } catch (error) {
      console.error('Error querying Screenpipe API:', error)
      return (
        <BotCard>
          <div className="text-red-500">
            Error querying Screenpipe API. Please try again later.
          </div>
        </BotCard>
      )
    }
  }
}
```