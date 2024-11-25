'use client';

import { useState } from 'react';
import FileUpload from './components/FileUpload';
import { transcribe } from './lib/transcribe';

export default function Home() {
    const [transcribedText, setTranscribedText] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const onUpload = async (file: File) => {
        setLoading(true);
        setError(null);

        try {
            const resultText = await transcribe(file);
            setTranscribedText(resultText);
        } catch (error) {
            console.error(error);
            setError((error as Error).message);
        }

        setLoading(false);
    };

    return (
        <div className="w-full max-w-2xl mx-auto p-6">
            <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">
                Document Transcriber Demo
            </h1>
            <FileUpload onUpload={onUpload} />
            {loading && <p className="mt-4 text-blue-600">Processing...</p>}
            {error && <p className="mt-4 text-red-600">{error}</p>}
            {transcribedText && (
                <div className="mt-8">
                    <h2 className="text-2xl font-semibold mb-4 text-gray-800">
                        Transcribed Text:
                    </h2>
                    <div className="p-4 bg-gray-100 text-gray-800 rounded shadow">
                        <div dangerouslySetInnerHTML={{ __html: transcribedText }} />
                    </div>
                </div>
            )}
        </div>
    );
}
