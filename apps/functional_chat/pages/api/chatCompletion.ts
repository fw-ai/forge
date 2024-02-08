import type { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage, ChatState } from '~/components/common/types';

function createMockRequest(queryParams: Record<string, any> = {}): NextApiRequest {
  return {
    query: queryParams
  } as NextApiRequest;
}

interface MockNextApiResponse extends NextApiResponse {
  data?: any;
}

function createMockResponse(): MockNextApiResponse {
  const res: Partial<MockNextApiResponse> = {};

  res.json = (data: any) => {
    res.data = data;
    return res as MockNextApiResponse;
  };

  return res as MockNextApiResponse;
}

async function fetchFunctionSpecs(endpoints: string[]) {
  const specs = await Promise.all(endpoints.map(async (func) => {
    const module = await import(`./functions/${func}.ts`);
    const req = createMockRequest({ action: 'spec' });
    const res = createMockResponse();
    await module.default(req, res);
    return res.data.json_schema;
  }));

  return specs;
}

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

  const endpointsStr = process.env.ACTIVE_FUNCTIONS;
  const endpoints = endpointsStr ? endpointsStr.split(',') : [];
  const tools = await fetchFunctionSpecs(endpoints);

  // console.log(`DEBUG: calling the model with messages: ${JSON.stringify([systemMessage, ...messages], null, 2)}\ntools: ${JSON.stringify(tools, null, 2)}\n----------------------------------`);
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
        // logprobs: 1,
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
