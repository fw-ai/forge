// eslint-enable no-implicit-coercion
'use client';
import { Alert, AlertTitle } from '@mui/material';
import { TrashIcon } from '@radix-ui/react-icons';
import { useReducer, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChatInput, ChatMessages } from '.';
import { ChatMessage, ChatMessageContent } from '../common/types';
import { AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { ChatScrollAnchor } from './ChatScrollAnchor';

const controller = new AbortController();

type BingSearchResponse = {
  // Structure based on Bing API response format
  webPages: {
    value: Array<{
      name: string;
      url: string;
      snippet: string;
    }>;
  };
};

type ChatState = {
  messages: ChatMessage[];
  temperature: number;
  max_tokens: number;
  top_p: number;
  top_k: number;
  presence_penalty: number;
  frequency_penalty: number;
  stop: string[];
  context_length_exceeded_behavior: 'truncate' | 'error';
};
type ChatAction<Type extends keyof ChatState> = { field: Type; value: ChatState[Type] };

async function chatCompletion(requestBody: ChatState, controller: AbortController, messages: ChatMessage[]): Promise<any> {
  const modelName = process.env.NEXT_PUBLIC_FIREWORKS_CHAT_MODEL;
  const apiKey = process.env.NEXT_PUBLIC_FIREWORKS_API_KEY;
  const systemMessage = {
    role: 'system',
    content: 'SYSTEM: You are a helpful assistant with access to functions. Use them only if you need more information. Do not abuse function calling.',
    // content: 'SYSTEM: You are a helpful assistant with access to functions. Use them only if you need more information. When making a decision about whether to call a function, do not be influenced by previous function call decisions. Do not abuse web search.',
  };
  const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        ...requestBody,
        model: modelName,
        stream: false,
        n: 1,
        logprobs: 1,
        temperature: 0,
        messages: [
          systemMessage,
          ...messages.map((m) => ({
            role: m.role,
            content: m.content,
            ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
            ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
          }))],
        tools: [
          //{
          //  type: 'function',
          //  function: {
          //    name: 'web_search',
          //    description: 'get information from the web',
          //    parameters: {
          //      type: 'object',
          //      properties: {
          //        query: {
          //          description: "search query",
          //          type: 'string'
          //        }
          //      },
          //      required: [
          //        "query"
          //      ]
          //    }
          //  }
          //},
          {
            type: 'function',
            function: {
              name: 'get_stock_quote',
              description: 'obtain the latest price and volume information for a given stock ticker symbol',
              parameters: {
                type: 'object',
                properties: {
                  symbol: {
                    description: "the stock ticker symbol whose price should be quoted",
                    type: 'string'
                  }
                },
                required: [
                  "symbol"
                ]
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'render_chart',
              description: 'generate chart from numeric data. The chart is rendered by Chart.js, a popular open-source charting library. The tool output should be displayed as ![text](image_url) where the image url includes blob: prefix',
              parameters: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    description: 'type of the chart'
                  },
                  data: {
                    type: 'object',
                    description: 'labels for the chart data',
                    properties: {
                      labels: {
                        type: 'array',
                        items: {
                          type: 'string'
                        }
                      },
                      datasets: {
                        type: 'array',
                        description: 'data points for the dataset',
                        items: {
                          type: 'object',
                          properties: {
                            data: {
                              type: 'array',
                              items: {
                                type: 'number'
                              }
                            }
                          },
                          required: ['data']
                        }
                      }
                    },
                    required: ['labels', 'datasets']
                  }
                },
                required: ['type', 'data']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'generate_image',
              description: 'generate an image from a text description. The tool output should be displayed as ![text](image_url) where the image url includes blob: prefix',
              parameters: {
                type: 'object',
                properties: {
                  prompt: {
                    description: "description of the image",
                    type: 'string'
                  },
                  negative_prompt: {
                    description: "concepts that should be excluded from the generated image",
                    type: 'string'
                  }
                },
                required: [
                  'prompt'
                ]
              }
            }
          },
        ]
      })
    });

  if (response.status === 429) {
    return { error: true, status: 'over_quota' };
  }

  if (response.status !== 200) {
    const errorFromServer = await response.json().catch(() => null);
    const errorMessage = errorFromServer?.error?.message ?? 'unknown_error';
    return { error: true, status: errorMessage };
  }

  if (!response.body) {
    return { error: true, status: 'unknown_error' };
  }

  const data = await response.json();

  const toolCalls = data.choices[0].message.tool_calls;
  return {
    id: data.id ?? uuidv4(),
    role: data.choices[0].message.role ?? 'assistant',
    content: data.choices[0].message.content ?? '',
    ...(toolCalls ? { toolCalls: toolCalls } : {}),
  } as ChatMessage;
}

// Function to call the Bing Search API
async function searchBing(query: string): Promise<BingSearchResponse> {
  const apiKey = 'fe79bb40587c427aa53ae3a01f215f18'; // Replace with your Bing Search API key
  const endpoint = 'https://api.bing.microsoft.com/v7.0/search';
  const resultsCount = 5; // Number of results to return

  try {
    const response = await fetch(`${endpoint}?q=${encodeURIComponent(query)}&count=${resultsCount}`, {
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Error from Bing API: ${response.statusText}`);
    }

    const fullResponse = await response.json();

    // Extract only the desired fields
    const data: BingSearchResponse = {
      webPages: {
        value: fullResponse.webPages.value.map((item: any) => ({
          name: item.name,
          url: item.url,
          snippet: item.snippet
        }))
      }
    };

    return data;
  } catch (error) {
    console.error('Error calling Bing Search API', error);
    throw error;
  }
}

async function webSearch(args: string): Promise<string> {
  const jsonObj = JSON.parse(args);

  if (!jsonObj || typeof jsonObj !== 'object' || !('query' in jsonObj)) {
    throw new Error(`Cannot parse web search arguments: ${args}`);
  }
  const query = jsonObj.query;
  const response = await searchBing(query);
  return JSON.stringify(response, null);
}

async function getStockQuote(args: string): Promise<any> {
  const jsonObj = JSON.parse(args);

  if (!jsonObj || typeof jsonObj !== 'object' || !('symbol' in jsonObj)) {
    throw new Error(`Cannot parse get stock quote arguments: ${args}`);
  }
  const symbol = jsonObj.symbol;

  const apiKey = 'T1P19WHZ6HXFQG0L';
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Requesting stock for symbol ${symbol} failed with code ${response.status} message ${await response.text()}`);
    }

    const data = await response.json();

    return JSON.stringify(data, null);
  } catch (error) {
    console.error('Error fetching stock quote:', error);
    throw error;
  }
}

async function renderChart(args: string): Promise<string> {
  const jsonObj = JSON.parse(args);

  if (!jsonObj || typeof jsonObj !== 'object') {
    throw new Error(`Cannot parse render chart arguments: ${args}`);
  }
  const chartJson = encodeURIComponent(JSON.stringify(jsonObj));
  const url = `https://quickchart.io/chart?c=${chartJson}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Error fetching image: ${response.statusText}`);
  }

  // Convert to Blob
  const imageBlob = await response.blob();

  // Create a local URL for the Blob
  const localUrl = URL.createObjectURL(imageBlob);
  console.log('DEBUG: localUrl: ' + localUrl);
  return JSON.stringify({ image_url: localUrl });
}

async function generateImage(args: string): Promise<string> {
  const jsonObj = JSON.parse(args);

  if (!jsonObj || typeof jsonObj !== 'object' || !('prompt' in jsonObj)) {
    throw new Error(`Cannot parse generate image arguments: ${args}`);
  }

  const prompt = jsonObj.prompt;
  const negativePrompt: string | undefined = jsonObj.negative_prompt;

  const baseApiUrl = 'https://api.fireworks.ai/inference/v1/image_generation';
  const modelId = process.env.NEXT_PUBLIC_FIREWORKS_IMAGE_GEN_MODEL;
  const response = await fetch(`${baseApiUrl}/${modelId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'image/jpeg',
      'Authorization': `Bearer X1FhZWbW6XEqgQnRZc4IuLGBinnAH9hgJleSijzzAGGW7ZKW`,
    },
    body: JSON.stringify({
      cfg_scale: 7,
      height: 1024,
      width: 1024,
      sampler: null,
      samples: 1,
      steps: 30,
      seed: 0,
      style_preset: null,
      safety_check: false,
      prompt: prompt,
      negative_prompt: negativePrompt,
    }),
  });

  if (response === null || !response.ok) {
    throw new Error((await response?.text()) ?? 'Something went wrong generating the image. Please try again');
  }

  // Convert to Blob
  const imageBlob = await response.blob();
  // Create a local URL for the Blob
  const localUrl = URL.createObjectURL(imageBlob);
  return JSON.stringify({ image_url: localUrl });
};

async function callFunctions(message: ChatMessage): Promise<ChatMessage | null> {
  if (message.toolCalls === undefined) {
    return null;
  }
  const callId = message.toolCalls[0]?.id;
  const func = message.toolCalls[0]?.function;

  if (callId === undefined || func === undefined || func.name === undefined || func.arguments === undefined) {
    return null;
  }

  let content: string;
  switch (func.name.toLowerCase()) {
    case 'web_search':
      content = await webSearch(func.arguments);
      break;
    case 'get_stock_quote':
      content = await getStockQuote(func.arguments);
      break;
    case 'render_chart':
      content = await renderChart(func.arguments);
      break;
    case 'generate_image':
      content = await generateImage(func.arguments);
      break;
    default:
      throw new Error(`Unsupported function: ${func.name}`);
  }

  return {
    content: content,
    id: uuidv4(),
    role: 'tool',
    toolCallId: callId,
    metadata: {
      totalTokens: 0,
      firstTokenTime: 0,
      averageTokenTime: 0,
      perplexity: null,
      hide: true,
    },
  }
}

export function ChatInferenceModule() {
  const [isLoading, setIsLoading] = useState(false);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [requestBody, setRequestBody] = useReducer(
    (state: ChatState, action: ChatAction<keyof ChatState>): ChatState => {
      if (action.field === 'stop') {
        return { ...state, [action.field]: (action.value as string[]).filter((v: string) => v.trim().length > 0) };
      }
      return { ...state, [action.field]: action.value };
    },
    {
      messages: [] as ChatMessage[],
      stop: [],
      top_p: 1,
      top_k: 50,
      presence_penalty: 0,
      frequency_penalty: 0,
      context_length_exceeded_behavior: 'truncate',
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      // ...model.generationDefaults!,
      temperature: 0,
      max_tokens: 1024,
    },
  );

  // eslint-disable-next-line complexity
  const fetchChatCompletion = async (text: string) => {
    const updatedMessages = [...requestBody.messages];

    try {
      setRequestStatus(null);
      setIsLoading(true);

      const content: string | ChatMessageContent[] = text;
      const newMessage = {
        id: uuidv4(),
        content: content,
        role: 'user', // model.conversationConfig?.roleNames.user ?? '',
      };
      updatedMessages.push(newMessage);
      setRequestBody({ field: 'messages', value: [...updatedMessages, { id: uuidv4(), content: '', role: 'assistant' }] });

      const response = await chatCompletion(requestBody, controller, updatedMessages);

      if (response.error === true) {
        setRequestStatus(response.status);
        setIsLoading(false);
        updatedMessages.pop();
        setRequestBody({ field: 'messages', value: [...updatedMessages] });
        return;
      }

      const assistantMessage = response as ChatMessage;
      updatedMessages.push(assistantMessage);

      const toolMessage = await callFunctions(assistantMessage);
      if (toolMessage !== null) {
        var lastMessage = updatedMessages.pop();
        if (lastMessage !== undefined) {
          lastMessage = {
            ...lastMessage,
            metadata: {
              ...lastMessage.metadata,
              hide: true
            }
          };
          updatedMessages.push(lastMessage);
        }
        updatedMessages.push(toolMessage);
        const response = await chatCompletion(requestBody, controller, updatedMessages);
        if (response.error === true) {
          setRequestStatus(response.status);
          setIsLoading(false);
          updatedMessages.pop();
          setRequestBody({ field: 'messages', value: [...updatedMessages] });
          return;
        }
        const assistantMessage = response as ChatMessage;
        updatedMessages.push(assistantMessage);
      }
      setRequestBody({ field: 'messages', value: [...updatedMessages] });

      console.log('DEBUG: updatedMessages: ' + JSON.stringify(updatedMessages, null, 2) + '\n----------------------------------');
    } catch {
      setRequestStatus('unknown_error');
      setRequestBody({ field: 'messages', value: [...updatedMessages] });
    }
    setIsLoading(false);
  };
  return (
    <div className="md:flex md:space-x-6 sm:mt-4">
      {/*<div className="md:w-2/3">*/}
      <div className="md:w-full">
        <Card className="max-sm:rounded-none flex h-[calc(100dvh-1.5rem)] sm:h-[calc(100dvh-2rem)] max-sm:w-screen overflow-hidden py-0 ">
          <div className="pl-4 pt-2 md:pt4 pb-4 flex w-full flex-col flex-1">
            <div className="flex flex-row justify-between">
              {requestBody.messages.length > 0 ? (
                <Button
                  className="lg:mr-4 md:border md:shadow-sm"
                  variant="ghost"
                  onClick={() => setRequestBody({ field: 'messages', value: [] })}
                >
                  {/* <span className="hidden md:block">Clear Chat</span> */}
                  <TrashIcon className="w-5 h-5 text-zinc-400 md:hidden" />
                </Button>
              ) : null}
            </div>
            <div className="border-b pt-2 border-zinc-200 w-full h-1 mr-2" />
            <ChatMessages messages={requestBody.messages} isLoading={isLoading}>
              {requestStatus ? (
                <Alert color="error" className="mr-4">
                  <AlertTitle>Error Generating response</AlertTitle>
                  <AlertDescription>
                    {requestStatus === 'over_quota'
                      ? 'You have exceeded your max requests per hour, please try again later.'
                      : requestStatus === 'unknown_error'
                        ? 'There was an error generating a response, please try again later.'
                        : `API Error: ${requestStatus}`}
                  </AlertDescription>
                </Alert>
              ) : null}
            </ChatMessages>

            <div className=" w-full justify-center pr-4">
              <ChatInput onSubmit={fetchChatCompletion} multiModal={false} isLoading={isLoading} />
              <ChatScrollAnchor trackVisibility={isLoading} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
