import { TranscribedData } from '../types';

export async function transcribe(file: File): Promise<TranscribedData> {
    // Read the file as base64
    const base64File = await fileToBase64(file);

    // Prepare the data to send to the API route
    const data = {
        fileType: file.type,
        fileContent: base64File,
    };

    // Call the API route
    const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Error: ${errorData.error || 'Unknown error occurred.'}`);
    }

    const responseData = await response.json();
    console.log('Transcribe Function - API Response:', responseData); // Logging for debugging

    return responseData.resultText; // This should now be TranscribedData
}

async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function () {
            const dataUrl = reader.result as string;
            const base64 = dataUrl.split(',')[1];
            resolve(base64);
        };
        reader.onerror = function (error) {
            reject(error);
        };
        reader.readAsDataURL(file);
    });
}
