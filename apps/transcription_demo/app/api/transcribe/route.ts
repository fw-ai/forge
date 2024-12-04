import { NextRequest, NextResponse } from 'next/server';
import { TranscribedData } from '../../types';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb', // Adjust as needed
        },
    },
};

export async function POST(req: NextRequest) {
    try {
        const { fileType, fileContent } = await req.json();

        // Construct the messages payload
        const messages = [
            {
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:${fileType};base64,${fileContent}`,
                        },
                    },
                ],
            },
        ];

        const payload = {
            model: 'accounts/fireworks/agents/transcription-preview',
            max_tokens: 8192,
            temperature: 0.0,
            messages: messages,
        };

        // Set up the headers, including the API key
        const headers = {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
            'x-fireworks-account-id': `${process.env.FIREWORKS_ACCOUNT_ID}`,
        };

        // Call the external API
        const apiResponse = await fetch(
            `${process.env.BASE_URL}/chat/completions`,
            {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload),
            }
        );

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            console.error('API Error:', errorText);
            return NextResponse.json(
                { error: 'Error from transcription API' },
                { status: 500 }
            );
        }

        const apiData = await apiResponse.json();
        console.log('API Data:', apiData); // Logging for debugging

        const resultText =
            apiData.choices[0]?.message?.content || 'No content received';
        console.log('Result Text:', resultText); // Logging for debugging

        // Parse the resultText assuming it's a JSON string
        let parsedResult: TranscribedData;
        try {
            parsedResult = JSON.parse(resultText);
        } catch (parseError) {
            console.error('Error parsing resultText:', parseError);
            return NextResponse.json(
                { error: 'Invalid transcription data format.' },
                { status: 500 }
            );
        }

        // Validate the parsedResult structure
        if (!parsedResult.pages || !Array.isArray(parsedResult.pages)) {
            console.error('Parsed Result does not contain pages:', parsedResult);
            return NextResponse.json(
                { error: 'Transcription data is missing pages.' },
                { status: 500 }
            );
        }

        return NextResponse.json({ resultText: parsedResult });
    } catch (error) {
        console.error('Error in API handler:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
