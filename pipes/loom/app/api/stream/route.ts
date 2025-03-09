import { Message } from 'ai';
import { OpenAI } from 'openai';
import { ContentItem } from "@screenpipe/js";
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { settings, chatMessages, floatingInput, selectedAgent, data } = await req.json();
  const MAX_CONTENT_LENGTH = settings.aiMaxContextChars || 8000;

  // had to trim down the context when the loom video is tooooo long :(
  const removeDuplicateLines = (textContent: string[])  => {
    const uniqueLines = Array.from(new Set(textContent));
    const rmdups = uniqueLines.map((i?) => i?.replace(/(\S+)(\s+\1)+/g, "$1"))
    let context = rmdups.join('\n');

    if (context.length > MAX_CONTENT_LENGTH) {
      context = context.substring(0, MAX_CONTENT_LENGTH);
    }

    return context;
  };

  const ocrTexts = data.map((item: ContentItem) => {
    if(item.type === "OCR"){
      return item.content.text;
    }
  });

  const context = removeDuplicateLines(ocrTexts);

  try {
    const openai = new OpenAI({
      apiKey: settings.aiProviderType === 'screenpipe-cloud'
        ? settings.user.token : settings.openaiApiKey,
      baseURL: settings.aiUrl,
    });

    const model = settings.aiModel;
    const customPrompt = settings.customPrompt || '';
    const customRules = settings.loom?.customRules || '';

    const messages = [
      {
        role: 'user' as const,
        content: `You are a helpful assistant specialized as a "${selectedAgent.name}". ${selectedAgent.systemPrompt}
          Rules:
          - Current time (JavaScript Date.prototype.toString): ${new Date().toString()}
          - User timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
          - User timezone offset: ${new Date().getTimezoneOffset()}
          - ${customPrompt ? `Prompt: ${customPrompt}` : ''}
          - Rules: ${customRules} `,
      },
      ...chatMessages.map((msg: Message) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      })),
      {
        role: 'user' as const,
        content: `Context data: ${context}
        User query: ${floatingInput}`,
      },
    ];

    const stream = await openai.chat.completions.create(
      {
        model: model,
        messages: messages,
        stream: true,
      },
    );

    let fullResponse = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      fullResponse += content;
    }

    return NextResponse.json({ response: fullResponse }, { status: 200 });
  } catch (error: any) {
    console.error('Error generating AI response:', error);
    return NextResponse.json(
      { message: "Failed to generate AI response" },
      { status: 500, statusText: `${error}`} 
    );
  }
}
