// eslint-enable no-implicit-coercion
'use client';
import { Alert, AlertTitle } from '@mui/material';
import { TrashIcon } from '@radix-ui/react-icons';
import { useReducer, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChatInput, ChatMessages } from '.';
import { ChatMessage, ChatMessageContent, ChatState } from '../common/types';
import { AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { ChatScrollAnchor } from './ChatScrollAnchor';

type ChatAction<Type extends keyof ChatState> = { field: Type; value: ChatState[Type] };

async function chatCompletion(requestBody: ChatState, messages: ChatMessage[]): Promise<any> {
  const response = await fetch('/api/chatCompletion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ requestBody, messages })
  });
  return response.json();
}

async function callFunction(name: string, args: string): Promise<any> {
  console.log(`DEBUG: call functions ${name} args ${args}`);
  const response = await fetch(`/api/functions/${name}?action=call&args=${encodeURIComponent(args)}`);
  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(`Function call failed: ${response.status} ${response.statusText} - ${errorDetails}`);
  }
  const data = await response.json();
  return JSON.stringify(data);
}

async function generateImage(name: string, args: string): Promise<string> {
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
      content = await callFunction('webSearch', func.arguments);
      break;
    case 'stock_quote':
      content = await callFunction('stockQuote', func.arguments);
      break;
    case 'render_chart':
      content = await generateImage('renderChart', func.arguments);
      break;
    case 'generate_image':
      content = await generateImage('generateImage', func.arguments);
      break;
    case 'popular_destinations':
      content = await callFunction('popularDestinations', func.arguments);
      break;
    case 'weather_history':
      content = await callFunction('weatherHistory', func.arguments);
      break;
    case 'flight_prices':
      content = await callFunction('flightPrices', func.arguments);
      break;
    default:
      throw new Error(`Unsupported function: $ { func.name }`);
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

      const response = await chatCompletion(requestBody, updatedMessages);

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
        const response = await chatCompletion(requestBody, updatedMessages);
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

