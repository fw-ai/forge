// eslint-enable no-implicit-coercion
'use client';
import React, { useReducer, useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Alert, AlertTitle } from '@mui/material';
import { TrashIcon, CameraIcon, SpeakerLoudIcon } from '@radix-ui/react-icons';
import { ChatInput, ChatMessages } from '.';
import { ChatMessage, ChatState, FunctionCall } from '../common/types';
import { stringifyObject, chatCompletion, callFunctions } from '../common/utils';
import { AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { ChatScrollAnchor } from './ChatScrollAnchor';
import Toggle from './toggle';
import Markdown from './markdown';
import { EmptyLLMOutput } from './empty-llm-state';

type ChatAction<Type extends keyof ChatState> = { field: Type; value: ChatState[Type] };

export function ChatInferenceModule() {
  const [functionSpecs, setFunctionSpecs] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);

  const [isCameraMode, setIsCameraMode] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const audioRecorder = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [recording, setRecording] = useState(false);
  const audioChunks = useRef<Blob[]>([]);
  const [transcribedAudio, setTranscribedAudio] = useState<string>('');

  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);


  const [requestBody, setRequestBody] = useReducer(
    (state: ChatState, action: ChatAction<keyof ChatState>): ChatState => {
      return { ...state, [action.field]: action.value };
    },
    {
      messages: [] as ChatMessage[],
      top_p: 1,
      top_k: 50,
      presence_penalty: 0,
      frequency_penalty: 0,
      context_length_exceeded_behavior: 'truncate',
      temperature: 0,
      max_tokens: 1024,
    },
  );

  useEffect(() => {
    fetch('/api/functionSpecs')
      .then(response => response.json())
      .then(data => setFunctionSpecs(data))
      .catch(error => console.error('Error fetching function specs:', error));
  }, []);

  useEffect(() => {
    if (isCameraMode && videoRef.current) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          startAudioRecording(stream);
        })
        .catch(err => console.error("Error accessing the camera and microphone", err));
    } else if (!isCameraMode) {
      stopCameraAndAudio();
    }
  }, [isCameraMode]);

  useEffect(() => {
    if (capturedImageUrl && !isTranscribing && pendingMessage) {
      const message = transcribedAudio || pendingMessage;
      fetchChatCompletion(`${message} Here is the image url: ${capturedImageUrl}`);
      setCapturedImageUrl(null);
      setPendingMessage(null);
    }
  }, [capturedImageUrl, isTranscribing, transcribedAudio, pendingMessage]);

  const startAudioRecording = (stream: MediaStream) => {
    audioRecorder.current = new MediaRecorder(stream);
    audioChunks.current = [];

    audioRecorder.current.ondataavailable = (event) => {
      audioChunks.current.push(event.data);
    };

    audioRecorder.current.onstop = async () => {
      const audioBlob = new Blob(audioChunks.current, { type: 'audio/mp3' });
      await transcribeAudio(audioBlob);
    };

    audioRecorder.current.start();
    setRecording(true);
  };

  const stopCameraAndAudio = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
    }
    if (audioRecorder.current && recording) {
      audioRecorder.current.stop();
    }
    setRecording(false);
    setCapturedImage(null);
  };

  const handleCameraToggle = () => {
    setIsCameraMode(!isCameraMode);
  };

  const captureAndSendImage = async () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        const imageDataUrl = canvasRef.current.toDataURL('image/jpeg');

        // Close camera view and stop recording
        setIsCameraMode(false);
        stopCameraAndAudio();

        try {
          const uploadResponse = await fetch('/api/upload-image', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ imageData: imageDataUrl }),
          });

          if (!uploadResponse.ok) {
            throw new Error('Failed to upload image');
          }

          const { imageUrl } = await uploadResponse.json();
          setCapturedImageUrl(imageUrl);
          setPendingMessage("What's in this image?");
        } catch (error) {
          console.error('Error in captureAndSendImage:', error);
        }
      }
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      setIsTranscribing(true);

      const response = await fetch('/api/audio-transcription', {
        method: 'POST',
        body: audioBlob,
        headers: {
          'Content-Type': 'audio/mp3',
        },
      });

      if (!response.ok) {
        throw new Error('Audio transcription failed');
      }

      const data = await response.json();
      console.log("Transcription response:", data);

      if (data && data.text) {
        setTranscribedAudio(data.text);
        setIsTranscribing(false);
      }
    } catch (error) {
      console.error('Error transcribing audio:', error);
    } finally {
      setIsTranscribing(false);
    }
  };


  // eslint-disable-next-line complexity
  const fetchChatCompletion = async (text: string) => {
    const updatedMessages = [...requestBody.messages];

    try {
      setRequestStatus(null);
      setIsLoading(true);

      const content: string = text;
      const newMessage = {
        id: uuidv4(),
        content: content,
        role: 'user', // model.conversationConfig?.roleNames.user ?? '',
      };
      updatedMessages.push(newMessage);
      setRequestBody({
        field: 'messages',
        value: [...updatedMessages, { id: uuidv4(), content: '', role: 'assistant', metadata: { loading: true } }]
      });

      const response = await chatCompletion(requestBody, updatedMessages);

      if (response.error === true) {
        setRequestStatus(JSON.stringify(response));
        setIsLoading(false);
        updatedMessages.pop();
        setRequestBody({ field: 'messages', value: [...updatedMessages] });
        return;
      }

      var assistantMessage = response as ChatMessage;
      updatedMessages.push(assistantMessage);

      do {
        const toolMessage = await callFunctions(assistantMessage);
        if (toolMessage === null) {
          break;
        } else {
          var lastMessage = updatedMessages.pop();
          if (lastMessage !== undefined) {
            lastMessage = {
              ...lastMessage,
              metadata: {
                ...lastMessage.metadata,
                hide: true,
              }
            };
            updatedMessages.push(lastMessage);
          }
          updatedMessages.push(toolMessage);
          const response = await chatCompletion(requestBody, updatedMessages);
          if (response.error === true) {
            setRequestStatus(JSON.stringify(response));
            setIsLoading(false);
            updatedMessages.pop();
            setRequestBody({ field: 'messages', value: [...updatedMessages] });
            return;
          }
          var finalAssistantMessage = response as ChatMessage;

          let functionCalls: FunctionCall[] = [];
          if (assistantMessage.toolCalls && assistantMessage.toolCalls.length > 0) {
            assistantMessage.toolCalls.forEach(toolCall => {
              if (toolCall.function) {
                functionCalls.push(toolCall.function);
              }
            });
          }
          var functionResponse;
          if (toolMessage) {
            functionResponse = toolMessage.content;
          }
          finalAssistantMessage = {
            ...finalAssistantMessage,
            metadata: {
              ...finalAssistantMessage.metadata,
              functionCalls: functionCalls,
              functionResponse: functionResponse,
            }
          };

          updatedMessages.push(finalAssistantMessage);
          assistantMessage = finalAssistantMessage;
        }
      } while (true);
      setRequestBody({ field: 'messages', value: [...updatedMessages] });

      console.log('DEBUG: updatedMessages: ' + JSON.stringify(updatedMessages, null, 2) + '\n----------------------------------');
    } catch {
      setRequestStatus('unknown_error');
      setRequestBody({ field: 'messages', value: [...updatedMessages] });
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetch('/api/functionSpecs')
      .then(response => response.json())
      .then(data => setFunctionSpecs(data))
      .catch(error => console.error('Error fetching function specs:', error));
  }, []); // Empty dependency array to run only once on mount

  return (
    <div className="md:flex md:space-x-6 sm:mt-4 overflow-y-auto">
      <div className="md:w-full">
        <Card className="max-sm:rounded-none flex h-[calc(100dvh-1.5rem)] sm:h-[calc(100dvh-2rem)] max-sm:w-screen overflow-hidden py-0 ">
          <div className="pl-4 pt-2 md:pt4 pb-4 flex w-full flex-col flex-1">
            <div className="flex flex-row justify-between overflow-y-auto mr-4">
              <Button
                className="lg:mr-4 md:border md:shadow-sm"
                variant="ghost"
                onClick={() => setRequestBody({ field: 'messages', value: [] })}
              >
                <TrashIcon className="w-5 h-5 text-zinc-400" />
              </Button>
              <Toggle showText="show available functions" hideText="hide available functions">
                <Markdown
                  key={uuidv4()}
                  content={'```javascript\n' + stringifyObject(functionSpecs) + '\n```'}
                />
              </Toggle>
            </div>
            <div className="border-b pt-2 border-zinc-200 w-full h-1 mr-2" />
            {isCameraMode && (
              <div className="relative">
                <video ref={videoRef} autoPlay className="w-full" />
                <canvas ref={canvasRef} className="hidden" />
                <Button
                  onClick={captureAndSendImage}
                  className="absolute bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-blue-500 text-white rounded"
                >
                  Capture and Send
                </Button>
              </div>
            )}
            {requestBody.messages.length === 0 && !isCameraMode && (
              <div className="mt-8 md:pt-16 mx-auto">
                <EmptyLLMOutput />
              </div>
            )}
            <ChatMessages messages={requestBody.messages} isLoading={isLoading}>
              {requestStatus ? (
                <Alert color="error" className="mr-4">
                  <AlertTitle>Error Generating Response</AlertTitle>
                  <AlertDescription>
                    {`API Error: ${requestStatus}`}
                  </AlertDescription>
                </Alert>
              ) : null}
            </ChatMessages>

            <div className="w-full justify-center pr-4 flex items-center space-x-2">
              <div className="flex-grow flex items-center space-x-2">
                <ChatInput onSubmit={fetchChatCompletion} multiModal={false} isLoading={isLoading} />
                <Button
                  className="md:border md:shadow-sm"
                  variant="ghost"
                  onClick={handleCameraToggle}
                >
                  <CameraIcon className="w-5 h-5 text-zinc-400" />
                </Button>
              </div>
            </div>
            <ChatScrollAnchor trackVisibility={isLoading} />
          </div>
        </Card>
      </div>
    </div>
  );

}
