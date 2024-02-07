import type { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage, ChatState } from '~/components/common/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  interface ChatRequestBody {
    requestBody: ChatState;
    messages: ChatMessage[];
  }

  const { requestBody, messages } = req.body as ChatRequestBody;

  const modelName = process.env.NEXT_PUBLIC_FIREWORKS_CHAT_MODEL;
  const apiKey = process.env.NEXT_PUBLIC_FIREWORKS_API_KEY;
  const systemMessage = {
    role: 'system',
    content: `You are a helpful assistant with access to functions. Use them if needed. If a function is not available, do not make one up. The date and time is ${new Date()}.`
  };
  const tools = [
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
    //     name: 'stock_quote',
    //     description: 'Obtains the latest price and volume information for a given stock ticker symbol.',
    //     parameters: {
    //       type: 'object',
    //       properties: {
    //         symbol: {
    //           description: "The stock ticker symbol whose price should be quoted.",
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
        description: 'Gets the most popular directions and corresponding airplane ticket prices from a specified city. Convert tool output to full city names.',
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
  console.log(`DEBUG: calling the model with messages: ${JSON.stringify([systemMessage, ...messages], null, 2)}\ntools: ${JSON.stringify(tools, null, 2)}\n----------------------------------`);
  const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        ...requestBody,
        model: modelName,
        stream: false,
        n: 1,
        temperature: 0,
        prompt_cache_max_len: 0,
        logprobs: 1,
        // raw_output: true,
        messages: [
          systemMessage,
          ...messages.map((m) => ({
            role: m.role,
            content: m.content,
            ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
            ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
          }))],
        tools: tools,
      })
    });

  if (!response.ok) {
    // Handle non-OK responses from the external API
    return res.status(response.status).json({ error: true, status: response.statusText });
  }

  if (!response.body) {
    return res.status(500).json({ error: true, status: 'unknown_error' });
  }

  const data = await response.json();
  console.log(`DEBUG: completion: ${JSON.stringify(data, null, 2)}`);

  const toolCalls = data.choices[0].message.tool_calls;
  res.json({
    id: data.id ?? uuidv4(),
    role: data.choices[0].message.role ?? 'assistant',
    content: data.choices[0].message.content ?? '',
    ...(toolCalls ? { toolCalls: toolCalls } : {}),
  });
}
