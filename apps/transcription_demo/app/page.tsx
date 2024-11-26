// ./app/page.tsx

'use client';

import { useState } from 'react';
import FileUpload from './components/FileUpload';
import { transcribe } from './lib/transcribe';
import Page from './components/Page';
import { TranscribedData, Page as PageType } from './types';

export default function Home() {
    const [transcribedData, setTranscribedData] = useState<TranscribedData | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const onUpload = async (file: File) => {
        setLoading(true);
        setError(null);
        setTranscribedData(null);

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
            <div className="w-full max-w-6xl mx-auto p-8">
                <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
                    <h1 className="text-3xl font-bold mb-8 text-center text-gray-800">
                        Document Transcription Demo
                    </h1>

                    <FileUpload onUpload={onUpload} isLoading={loading} />

                    {error && (
                        <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
                            <p className="text-red-600 font-medium">{error}</p>
                        </div>
                    )}
                </div>

                {transcribedData && (
                    <div className="bg-white rounded-2xl shadow-lg p-8">
                        <h2 className="text-2xl font-bold mb-8 text-gray-800 border-b pb-4">
                            Transcribed Document
                        </h2>
                        <div className="space-y-8">
                            {transcribedData.pages.map((page: PageType, pageIndex: number) => (
                                <Page key={pageIndex} pageNumber={pageIndex + 1} fragments={page.fragments} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
