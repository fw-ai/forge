import { ChatMessage, ChatState, FunctionCall } from './types';
import { v4 as uuidv4 } from 'uuid';

export function stringifyObject(obj: any, indentLevel: number = 0): string {
  const indent = ' '.repeat(indentLevel * 4); // 4 spaces per indent level
  const subIndent = ' '.repeat((indentLevel + 1) * 4);

  if (Array.isArray(obj)) {
    return '[\n' + obj.map(item => subIndent + stringifyObject(item, indentLevel + 1)).join(',\n') + '\n' + indent + ']';
  } else if (typeof obj === 'object' && obj !== null) {
    return '{\n' + Object.entries(obj).map(([key, value]) =>
      `${subIndent}${key}: ${stringifyObject(value, indentLevel + 1)}`).join(',\n') + '\n' + indent + '}';
  } else {
    return JSON.stringify(obj);
  }
}

export async function chatCompletion(requestBody: ChatState, messages: ChatMessage[]): Promise<any> {
  const response = await fetch('/api/chatCompletion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ requestBody, messages })
  });
  return response.json();
}

export async function callFunction(name: string, args: string): Promise<any> {
  console.log(`DEBUG: call functions ${name} args ${args}`);
  const response = await fetch(`/api/functions/${name}?action=call&args=${encodeURIComponent(args)}`);
  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(`Function call failed: ${response.status} ${response.statusText} - ${errorDetails}`);
  }
  const data = await response.json();
  return JSON.stringify(data);
}

export async function generateImage(name: string, args: string): Promise<string> {
  const response = await fetch(`/api/functions/${name}?action=call&args=${encodeURIComponent(args)}`);
  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(`Function call failed: ${response.status} ${response.statusText} - ${errorDetails}`);
  }
  // Assuming the server returns a direct link to the image
  const imageBlob = await response.blob();
  const imageUrl = URL.createObjectURL(imageBlob);

  return JSON.stringify({ image_url: imageUrl });
};

export async function callFunctions(message: ChatMessage): Promise<ChatMessage | null> {
  if (message.toolCalls === undefined) {
    return null;
  }

  const promises = message.toolCalls.map(async (toolCall) => {
    const callId = toolCall?.id;
    const func = toolCall?.function;

    if (callId === undefined || func === undefined || func.name === undefined || func.arguments === undefined) {
      return null;
    }

    let content: string;
    switch (func.name) {
      // TODO: figure out a better way to handle this
      case 'renderChart':
      case 'generateImage':
        content = await generateImage(func.name, func.arguments);
        break;
      default:
        content = await callFunction(func.name, func.arguments);
        break;
    }

    return content;
  });

  const results = await Promise.all(promises);
  const combinedContent = results.filter(content => content !== null).join('\n');

  return {
    content: combinedContent,
    id: uuidv4(),
    role: 'tool',
    metadata: {
      totalTokens: 0,
      firstTokenTime: 0,
      averageTokenTime: 0,
      perplexity: null,
      hide: true
    },
  }
}
