'use client';

import { useState } from 'react';
import FileUpload from './components/FileUpload';
import { transcribe } from './lib/transcribe';
import Page from './components/Page';
import { TranscribedData, Page as PageType } from './types';
import DocumentViewer from './components/DocumentViewer';
import Image from 'next/image';

export default function Home() {
    const [transcribedData, setTranscribedData] = useState<TranscribedData | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [file, setFile] = useState<File | null>(null);

    const onUpload = async (file: File) => {
        setLoading(true);
        setError(null);
        setTranscribedData(null);
        setFile(file);

        try {
            const parsedData = await transcribe(file);
            console.log('Parsed Data:', parsedData); // Logging for debugging

            if (parsedData && Array.isArray(parsedData.pages)) {
                setTranscribedData(parsedData);
            } else {
                throw new Error('Invalid transcription data format.');
            }
        } catch (error) {
            console.error('Upload Error:', error);
            setError((error as Error).message || 'An error occurred while processing the file.');
        }

        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 w-full">
            <div className="w-full max-w-7xl mx-auto p-4">
                <div className="bg-white rounded-2xl shadow-lg p-4 mb-4">
                    <div className="flex flex-col items-center mb-4">
                        <div className="flex justify-between items-center w-full mb-2">
                            <div className="flex items-center">
                                <span className="text-sm text-gray-600 mr-2">Powered by</span>
                                <a href="http://fireworks.ai" target="_blank" rel="noopener noreferrer">
                                    <Image
                                        src="/fireworks-ai-wordmark-color-dark.svg"
                                        alt="Fireworks AI"
                                        width={100}
                                        height={20}
                                    />
                                </a>
                            </div>
                            <div className="flex items-center">
                                <a
                                    href="https://github.com/fw-ai/forge/tree/main/apps/transcription_demo"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center px-3 py-1 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                                    </svg>
                                    Repo
                                </a>
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-800">
                            Document Transcription Demo
                        </h1>
                    </div>

                    <FileUpload onUpload={onUpload} isLoading={loading} />

                    {error && (
                        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
                            <p className="text-red-600 font-medium">{error}</p>
                        </div>
                    )}
                </div>

                {(file || transcribedData) && (
                    <div className="flex flex-col gap-4 mt-4">
                        {transcribedData?.pages.map((page: PageType, pageIndex: number) => (
                            <div key={pageIndex} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {file && (
                                    <div className="bg-white rounded-2xl shadow-lg p-4">
                                        <h2 className="text-lg font-bold mb-2 text-gray-800 border-b pb-2">
                                            Original Page {pageIndex + 1}
                                        </h2>
                                        <DocumentViewer file={file} pageNumber={pageIndex + 1} />
                                    </div>
                                )}

                                <div className="bg-white rounded-2xl shadow-lg p-4">
                                    <h2 className="text-lg font-bold mb-2 text-gray-800 border-b pb-2">
                                        Transcribed Page {pageIndex + 1}
                                    </h2>
                                    <Page pageNumber={pageIndex + 1} fragments={page.fragments} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}