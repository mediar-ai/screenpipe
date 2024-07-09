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
    model: openai('gpt-3.5-turbo'),
    initial: <SpinnerMessage />,
    system: `\
    You are a personal assistant that has access to the history of laptop screen time and audio of the user. 
    Cou can help user find information recorded in the screen, and audio.
    Once you receive a query, you call a local server to retrieve information and then answer user query as much as possible.`,
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
              `http://127.0.0.1:3030/search?q=${encodeURIComponent(query)}&content_type=${contentType}&limit=${limit}&offset=${offset}`
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
            console.log('REQUEST: ',`http://127.0.0.1:3030/search?q=${encodeURIComponent(query)}&content_type=${contentType}&limit=${limit}&offset=${offset}`)
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
    submitUserMessage,
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
