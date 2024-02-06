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
  console.log('DEBUG: calling the model with messages: ' + JSON.stringify(messages, null, 2) + '\n----------------------------------');
  const modelName = process.env.NEXT_PUBLIC_FIREWORKS_CHAT_MODEL;
  const apiKey = process.env.NEXT_PUBLIC_FIREWORKS_API_KEY;
  const systemMessage = {
    role: 'system',
    content: `SYSTEM: You are a helpful assistant with access to functions. Use them if needed. If a function is not available, do not one up. The date and time is ${new Date()}.`
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
          // {
          //   type: 'function',
          //   function: {
          //     name: 'get_stock_quote',
          //     description: 'Obtains the latest price and volume information for a given stock ticker symbol.',
          //     parameters: {
          //       type: 'object',
          //       properties: {
          //         symbol: {
          //           description: "the stock ticker symbol whose price should be quoted",
          //           type: 'string'
          //         }
          //       },
          //       required: [
          //         "symbol"
          //       ]
          //     }
          //   }
          // },
          {
            type: 'function',
            function: {
              name: 'render_chart',
              description: 'Generates chart from numeric data. The chart is rendered by Chart.js, a popular open-source charting library. The tool output should be displayed as ![text](image_url) where the image url includes blob: prefix.',
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
              description: 'Generates an image from a text description. The tool output should be displayed as ![text](image_url) where the image url includes blob: prefix.',
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
          {
            type: 'function',
            function: {
              name: 'popular_destinations',
              description: 'Gets the most popular directions from a specified city. Convert tool output to full city names.',
              parameters: {
                type: 'object',
                properties: {
                  origin_iata: {
                    type: 'string',
                    pattern: '^[A-Z]{2,3}$',
                    description: 'The point of departure. Must be an IATA city code or a country code, 2 to 3 symbols in length.'
                  }
                },
                required: ['origin_iata']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'weather_history',
              description: 'Retrieves daily historical weather records for a given location and month.',
              parameters: {
                type: 'object',
                properties: {
                  locations: {
                    description: 'Location to get the weather for (e.g., city or country).',
                    type: 'string'
                  },
                  month: {
                    description: 'Month number. Must be between 1 and 12.',
                    type: 'number'
                  }
                },
                required: ['locations', 'month']
              }
            }
          },
          /*
          {
            type: 'function',
            function: {
              name: 'flight_prices',
              description: 'Returns flight tickets for specific destinations and dates.',
              parameters: {
                type: 'object',
                properties: {
                  origin: {
                    type: 'string',
                    pattern: '^[A-Z]{3}$',
                    description: 'An IATA code of a city or an airport of the origin.'
                  },
                  destination: {
                    type: 'string',
                    pattern: '^[A-Z]{3}$',
                    description: 'An IATA code of a city or an airport of the destination. Required if "origin" is not specified.'
                  },
                  departure_at: {
                    type: 'string',
                    pattern: '^\\d{4}-\\d{2}(-\\d{2})?$',
                    description: 'The departure date in "YYYY-MM" or "YYYY-MM-DD" format.'
                  },
                  return_at: {
                    type: 'string',
                    pattern: '^\\d{4}-\\d{2}(-\\d{2})?$',
                    description: 'The return date in "YYYY-MM" or "YYYY-MM-DD" format. Do not specify for one-way tickets.'
                  },
                  one_way: {
                    type: 'boolean',
                    description: 'Indicates if the ticket is one-way (true) or round-trip (false).'
                  },
                  direct: {
                    type: 'boolean',
                    default: false,
                    description: 'Indicates if only non-stop tickets should be returned. Default is false.'
                  },
                  sorting: {
                    type: 'string',
                    enum: ['price', 'route'],
                    default: 'price',
                    description: 'The sorting method of prices. Default is "price". Options are "price" and "route".'
                  }
                },
                required: ['origin']
              }
            }
          }, */
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
  const apiKey = process.env.NEXT_PUBLIC_BING_SEARCH_KEY || 'set the key in .env or .env.local';
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

  const apiKey = process.env.NEXT_PUBLIC_ALPHAVANTAGE_KEY;
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

async function popularDestinations(args: string): Promise<any> {
  const jsonObj = JSON.parse(args);

  if (!jsonObj || typeof jsonObj !== 'object' || !('origin_iata' in jsonObj)) {
    throw new Error(`Cannot parse popular destinations arguments: ${args}`);
  }

  const apiKey = process.env.NEXT_PUBLIC_RAPIDAPI_KEY || 'set the key in .env or .env.local';
  const accessToken = process.env.NEXT_PUBLIC_TRAVELPAYOUTS_KEY || 'set the key in .env or .env.local';

  const url = new URL('https://travelpayouts-travelpayouts-flight-data-v1.p.rapidapi.com/v1/city-directions');
  url.searchParams.append('origin', jsonObj.origin_iata);
  url.searchParams.append('currency', 'USD');

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Access-Token': accessToken,
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'travelpayouts-travelpayouts-flight-data-v1.p.rapidapi.com'
      }
    });

    if (!response.ok) {
      throw new Error(`Requesting popular destinations with args ${args} failed with code ${response.status} message ${await response.text()}`);
    }

    let data = await response.json();
    if (data.data === undefined) {
      return JSON.stringify(data, null);
    }
    data = data.data;

    // Take the top 10 entries.
    data = Object.keys(data).slice(0, 10).map(key => [key, data[key]]);

    return JSON.stringify(data, null);
  } catch (error) {
    console.error('Error requesting popular destinations:', error);
    throw error;
  }
}

async function weatherHistory(args: string): Promise<any> {
  const jsonObj = JSON.parse(args);

  if (!jsonObj || typeof jsonObj !== 'object') {
    throw new Error(`Cannot parse weather history arguments: ${args}`);
  }

  const apiKey = process.env.NEXT_PUBLIC_VISUALCROSSING_KEY || 'set the key in .env or .env.local';

  const url = new URL('https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/weatherdata/history');

  url.searchParams.append('key', apiKey);
  url.searchParams.append('aggregateHours', '24');
  url.searchParams.append('unitGroup', 'us');
  url.searchParams.append('contentType', 'json');
  url.searchParams.append('outputDateTimeFormat', 'yyyy-MM-dd');

  if (jsonObj.month !== undefined) {
    const year = new Date().getFullYear() - 1;
    const month = Number(jsonObj.month);
    const lastDay = new Date(year, month, 0).getDate();
    url.searchParams.append('startDateTime', `${year}-${month}-01`);
    url.searchParams.append('endDateTime', `${year}-${month}-${lastDay}`);
  }
  if (jsonObj.locations !== undefined) {
    url.searchParams.append('locations', jsonObj.locations);
  }

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Requesting historical weather with args ${args} failed with code ${response.status} message ${await response.text()}`);
    }

    let data = await response.json();

    if (data.columns === undefined || data.locations === undefined) {
      return JSON.stringify(data, null);
    }

    const columns = data.columns;
    const transformed: Record<string, any[]> = {};
    Object.keys(data.locations).forEach(locationKey => {
      const location = data.locations[locationKey];
      const values = location.values.map((value: Record<string, any>) => {
        const transformedValue: any = {};
        Object.entries(columns).forEach(([key, column]) => {
          if (key === 'temp' || key === 'precip') {
            const col = column as any;
            transformedValue[col.name] = value[key];
          }
        });
        if (value.datetimeStr !== undefined) {
          transformedValue['datetimeStr'] = value.datetimeStr;
        }
        return transformedValue;
      });
      transformed[locationKey] = values;
    });

    return JSON.stringify(transformed, null);
  } catch (error) {
    console.error('Error requesting historical weather:', error);
    throw error;
  }
}

async function flightPrices(args: string): Promise<any> {
  const jsonObj = JSON.parse(args);

  const apiKey = process.env.NEXT_PUBLIC_TRAVELPAYOUTS_KEY || 'set the key in .env or .env.local';
  const url = new URL('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
  if (jsonObj.origin !== undefined) {
    url.searchParams.append('origin', jsonObj.origin);
  }
  if (jsonObj.destination !== undefined) {
    url.searchParams.append('destination', jsonObj.destination);
  }
  if (jsonObj.departureAt !== undefined) {
    url.searchParams.append('departure_at', jsonObj.departureAt);
  }
  if (jsonObj.returnAt !== undefined) {
    url.searchParams.append('return_at', jsonObj.returnAt);
  }
  if (jsonObj.sorting !== undefined) {
    url.searchParams.append('sorting', jsonObj.sorting);
  }
  if (jsonObj.direct !== undefined) {
    url.searchParams.append('direct', jsonObj.direct.toString());
  }
  if (jsonObj.oneWay !== undefined) {
    url.searchParams.append('one_way', jsonObj.oneWay.toString());
  }
  url.searchParams.append('currency', 'USD');
  url.searchParams.append('market', 'us');
  url.searchParams.append('limit', '10');
  url.searchParams.append('token', apiKey);

  try {
    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Requesting flight prices with ${args} failed with code ${response.status} message ${await response.text()}`);
    }

    const data = await response.json();

    return JSON.stringify(data, null);
  } catch (error) {
    console.error('Error fetching flight prices:', error);
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
  const apiKey = process.env.NEXT_PUBLIC_FIREWORKS_API_KEY;
  const response = await fetch(`${baseApiUrl}/${modelId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'image/jpeg',
      'Authorization': `Bearer ${apiKey}`,
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
  console.log('DEBUG: call functions message: ' + JSON.stringify(message));
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
    case 'popular_destinations':
      content = await popularDestinations(func.arguments);
      break;
    case 'weather_history':
      content = await weatherHistory(func.arguments);
      break;
    case 'flight_prices':
      content = await flightPrices(func.arguments);
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
                  <TrashIcon className="w-5 h-5 text-zinc-400" />
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

