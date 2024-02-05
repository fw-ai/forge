import { ChatMessage as ChatMessageInterface } from '~/components/common/types';
import { cn } from '~/lib/utils';

import { CheckIcon, CopyIcon } from '@radix-ui/react-icons';

import { Button } from '../ui/button';
import { Card } from '../ui/card';
import ChatAvatar from './chat-avatar';
import Markdown from './markdown';
import { useCopyToClipboard } from './use-copy-to-clipboard';

export default function ChatMessage(chatMessage: ChatMessageInterface) {
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 });
  return (
    <div
      className={cn(
        'flex items-start gap-4 pr-5 pt-5',
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare
        chatMessage.metadata?.used === false ? 'opacity-40' : undefined,
      )}
    >
      <ChatAvatar role={chatMessage.role} />
      <div className="group flex flex-1 justify-between gap-2 ">
        <div className="flex-1">
          {chatMessage.role === 'assistant' && chatMessage.content.length < 2 ? (
            <div className="flex justify-start items-start mt-1">
              <div className="flex space-x-1 h-6 ">
                <span className="typing-dots animate-loader"></span>
                <span className="typing-dots animate-loader animation-delay-200"></span>
                <span className="typing-dots animate-loader animation-delay-400"></span>
              </div>
            </div>
          ) : null}
          {typeof chatMessage.content === 'string' ? (
            <Markdown
              key={chatMessage.id}
              content={chatMessage.role === 'user' ? chatMessage.content.replace(/\n/giu, '\n\n') : chatMessage.content}
            />
          ) : (
            chatMessage.content.map((content, index) => {
              if (content.type === 'text') {
                return (
                  <Markdown
                    key={index}
                    content={
                      chatMessage.role === 'user'
                        ? // input
                          (content.text || '').replace(/\n/giu, '\n\n')
                        : content.text || ''
                    }
                  />
                );
              }
              return (
                <Card
                  key={index}
                  className="p2 overflow-hidden flex max-sm:justify-center mt-2 w-30 h-30 max-w-[100vw-20vw] md:max-w-lg max-h-[100vw-20vw] md:max-h-lg"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={content.image_url?.url}
                    className="max-w-[100vw-20vw] md:max-w-lg max-h-[100vw-20vw] md:max-h-lg"
                  />
                </Card>
              );
            })
          )}
          {chatMessage?.metadata?.averageTokenTime ? (
            <div className="flex justify-start md:justify-end items-center mt-1">
              <span className="text-xs text-zinc-400">
                {chatMessage.metadata.firstTokenTime?.toFixed(0) || '-- '}ms initial latency{' | '}
                {chatMessage.metadata.averageTokenTime.toFixed(2)} tokens/s
              </span>
            </div>
          ) : null}
        </div>
        <Button
          onClick={() => copyToClipboard(chatMessage.content as string)}
          size="icon"
          variant="ghost"
          className="max-sm:hidden h-8 w-8 opacity-0 group-hover:opacity-100"
        >
          {isCopied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
