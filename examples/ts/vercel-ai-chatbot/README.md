



https://github.com/louis030195/screen-pipe/assets/25003283/6a0d16f6-15fa-4b02-b3fe-f34479fdc45e



this is a copy of https://github.com/vercel/ai-chatbot 

i just added in `lib/chat/actions.tsx` a tool to call screenpipe api (in the tools list):

```ts
// tools ...
      queryScreenpipeAPI: {
        description:
          'Query the Screenpipe API for OCR that appeared on user s screen and audio transcriptions from his mic',
        parameters: z.object({
          query: z
            .string()
            .describe(
              'The search query which match exact keywords. Try to use a single keyword that would match the user intent'
            ),
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
          console.log('screenpipe-chatbot will use content type: ', contentType)
          console.log('screenpipe-chatbot will use query: ', query)
          console.log('screenpipe-chatbot will use limit: ', limit)
          console.log('screenpipe-chatbot will use offset: ', offset)
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
                `API request failed with status ${response.status} and response ${response.statusText}`
              )
            }

            const data = await response.json()

            const toolCallId = nanoid()

            // Prepare the data for GPT-4
            const dataForGPT = JSON.stringify(data, null, 2)

            // Create a prompt for GPT-4
            const prompt = `Based on the following search results, please provide a concise and informative answer to the user's query "${query}":

${dataForGPT}

Please summarize the key points and present the information in a clear, easy-to-read format.`

            let textStream = createStreamableValue('')
            let textNode = <BotMessage content={textStream.value} />
            let isStreamingComplete = false

            const gpt4Response = await streamUI({
              model: openai('gpt-4o'),
              messages: [{ role: 'user', content: prompt }],
              text: ({ content, done, delta }) => {
                if (done) {
                  textStream.done()
                  isStreamingComplete = true
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
                            result: content
                          }
                        ]
                      }
                    ]
                  })
                } else {
                  textStream.update(delta)
                }

                return (
                  <>
                    {textNode}
                    {isStreamingComplete && (
                      <MemoizedReactMarkdown className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 max-w-full max-h-[300px] overflow-auto border border-gray-200 rounded-md mt-4">
                        {`\`\`\`json
${dataForGPT}
\`\`\``}
                      </MemoizedReactMarkdown>
                    )}
                  </>
                )
              }
            })

            return gpt4Response.value
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
