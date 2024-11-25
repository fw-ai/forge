'use client';

export async function transcribe(file: File): Promise<string> {
    // Read the file as base64
    const base64File = await fileToBase64(file);

    // Prepare the data to send to the API route
    const data = {
        fileName: file.name,
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
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} ${errorText}`);
    }

    const responseData = await response.json();
    return responseData.resultText;
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
