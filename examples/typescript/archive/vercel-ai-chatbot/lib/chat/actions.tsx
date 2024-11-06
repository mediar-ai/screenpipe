import 'server-only'

import {
  createAI,
  createStreamableUI,
  getMutableAIState,
  getAIState,
  streamUI,
  createStreamableValue
} from 'ai/rsc'
import { openai } from '@ai-sdk/openai'

import {
  spinner,
  BotCard,
  BotMessage,
  SystemMessage,
  Stock,
  Purchase
} from '@/components/stocks'

import { z } from 'zod'
import { EventsSkeleton } from '@/components/stocks/events-skeleton'
import { Events } from '@/components/stocks/events'
import { StocksSkeleton } from '@/components/stocks/stocks-skeleton'
import { Stocks } from '@/components/stocks/stocks'
import { StockSkeleton } from '@/components/stocks/stock-skeleton'
import {
  formatNumber,
  runAsyncFnWithoutBlocking,
  sleep,
  nanoid
} from '@/lib/utils'
import { saveChat } from '@/app/actions'
import { SpinnerMessage, UserMessage } from '@/components/stocks/message'
import { Chat, Message } from '@/lib/types'
import { auth } from '@/auth'
import { MemoizedReactMarkdown } from '@/components/markdown'

async function submitUserMessage(content: string) {
  'use server'

  const aiState = getMutableAIState<typeof AI>()

  aiState.update({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      {
        id: nanoid(),
        role: 'user',
        content
      }
    ]
  })

  let textStream: undefined | ReturnType<typeof createStreamableValue<string>>
  let textNode: undefined | React.ReactNode

  const result = await streamUI({
    model: openai('gpt-4o-mini'),
    initial: <SpinnerMessage />,
    system: `\
    You are a personal assistant that has access to the history of the laptop screentime and audio of the user. 
    You should call the user 'My master'
    Help user find information recorded in the screen, and audio.
    Once you receive a query your job is to adapt it for keyword search to get the most relevant results from the database.
    Your responses should be solely based on the information extracted from the database. 
    Do not include any information from your background knowledge unless explicitly asked. 
    `,
    messages: [
      ...aiState.get().messages.map((message: any) => ({
        role: message.role,
        content: message.content,
        name: message.name
      }))
    ],
    text: ({ content, done, delta }) => {
      if (!textStream) {
        textStream = createStreamableValue('')
        textNode = <BotMessage content={textStream.value} />
      }

      if (done) {
        textStream.done()
        aiState.done({
          ...aiState.get(),
          messages: [
            ...aiState.get().messages,
            {
              id: nanoid(),
              role: 'assistant',
              content
            }
          ]
        })
      } else {
        textStream.update(delta)
      }

      return textNode
    },
    tools: {
      queryScreenpipeAPI: {
        description: `Query the Screenpipe API for OCR that appeared on user's screen and audio transcriptions from their mic. 
        Rules:
        - Use the date & time args smartly to get the most relevant results. Current user date & time is ${new Date().toISOString()}
        - Generate 3-5 queries to get the most relevant results. Use a single keyword that would match the user intent per query
        - Use only one word per query (in the q field)
        - Make sure to answer the user question, ignore the data in your prompt not relevant to the user question
        `,
        parameters: z.object({
          queries: z
            .array(
              z.object({
                query: z
                  .string()
                  .describe(
                    'The search query matching exact keywords. Use a single keyword that best matches the user intent'
                  ),
                contentType: z
                  .enum(['ocr', 'audio'])
                  .describe(
                    'The type of content to search for: screenshot data or audio transcriptions'
                  ),
                limit: z
                  .number()
                  .optional()
                  .describe(
                    "Number of results to return (default: 5). Don't return more than 50 results as it will be fed to an LLM"
                  ),
                offset: z
                  .number()
                  .optional()
                  .describe('Offset for pagination (default: 0)'),
                startTime: z
                  .string()
                  .optional()
                  .describe('Start time for search range in ISO 8601 format'),
                endTime: z
                  .string()
                  .optional()
                  .describe('End time for search range in ISO 8601 format')
              })
            )
        }),
        generate: async function* ({ queries }) {
          console.log('screenpipe-chatbot will use queries: ', queries)
          yield (
            <BotCard>
              <div className="inline-flex items-start gap-1 md:items-center">
                {spinner}
                <p className="mb-2">Reading your screen and audio data...</p>
              </div>
            </BotCard>
          )

          try {
            const results = await Promise.all(
              queries.map(async query => {
                const {
                  query: q,
                  contentType,
                  limit = 5,
                  offset = 0,
                  startTime,
                  endTime
                } = query
                const url = new URL('http://127.0.0.1:3030/search')
                url.searchParams.append('q', q)
                url.searchParams.append('content_type', contentType)
                url.searchParams.append('limit', limit.toString())
                url.searchParams.append('offset', offset.toString())
                if (startTime) url.searchParams.append('start_time', startTime)
                if (endTime) url.searchParams.append('end_time', endTime)

                const response = await fetch(url.toString())
                if (!response.ok) {
                  throw new Error(
                    `API request failed: ${response.status} ${response.statusText}`
                  )
                }
                return response.json()
              })
            )

            const toolCallId = nanoid()
            const dataForGPT = JSON.stringify(results, null, 2)

            // Create a prompt for GPT-4
            const prompt = `Based on the following search results, please provide a concise and informative answer to the user's question "${content}":

            ${dataForGPT}

            Please summarize the key points and present the information in a clear, easy-to-read format. Be concise`

            console.log('screenpipe-chatbot will use prompt: ', prompt)

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
                            args: { queries }
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
    }
  })

  return {
    id: nanoid(),
    display: result.value
  }
}

export type AIState = {
  chatId: string
  messages: Message[]
}

export type UIState = {
  id: string
  display: React.ReactNode
}[]

export const AI = createAI<AIState, UIState>({
  actions: {
    submitUserMessage
  },
  initialUIState: [],
  initialAIState: { chatId: nanoid(), messages: [] },
  onGetUIState: async () => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const aiState = getAIState() as Chat

      if (aiState) {
        const uiState = getUIStateFromAIState(aiState)
        return uiState
      }
    } else {
      return
    }
  },
  onSetAIState: async ({ state }) => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const { chatId, messages } = state

      const createdAt = new Date()
      const userId = session.user.id as string
      const path = `/chat/${chatId}`

      const firstMessageContent = messages[0].content as string
      const title = firstMessageContent.substring(0, 100)

      const chat: Chat = {
        id: chatId,
        title,
        userId,
        createdAt,
        messages,
        path
      }

      await saveChat(chat)
    } else {
      return
    }
  }
})

export const getUIStateFromAIState = (aiState: Chat) => {
  return aiState.messages
    .filter(message => message.role !== 'system')
    .map((message, index) => ({
      id: `${aiState.chatId}-${index}`,
      display:
        message.role === 'tool' ? (
          message.content.map(tool => {
            return tool.toolName === 'listStocks' ? (
              <BotCard>
                {/* TODO: Infer types based on the tool result*/}
                {/* @ts-expect-error */}
                <Stocks props={tool.result} />
              </BotCard>
            ) : tool.toolName === 'showStockPrice' ? (
              <BotCard>
                {/* @ts-expect-error */}
                <Stock props={tool.result} />
              </BotCard>
            ) : tool.toolName === 'showStockPurchase' ? (
              <BotCard>
                {/* @ts-expect-error */}
                <Purchase props={tool.result} />
              </BotCard>
            ) : tool.toolName === 'getEvents' ? (
              <BotCard>
                {/* @ts-expect-error */}
                <Events props={tool.result} />
              </BotCard>
            ) : null
          })
        ) : message.role === 'user' ? (
          <UserMessage>{message.content as string}</UserMessage>
        ) : message.role === 'assistant' &&
          typeof message.content === 'string' ? (
          <BotMessage content={message.content} />
        ) : null
    }))
}
