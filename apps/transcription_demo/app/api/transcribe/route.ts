import { NextRequest, NextResponse } from 'next/server';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb', // Adjust as needed
        },
    },
};

export async function POST(req: NextRequest) {
    try {
        const { fileName, fileType, fileContent } = await req.json();

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
                    }
                ],
            },
        ];

        const payload = {
            model: 'accounts/fireworks/agents/transcription',
            max_tokens: 4096,
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

        const resultText =
            apiData.choices[0].message.content || 'No content received';

        return NextResponse.json({ resultText });
    } catch (error) {
        console.error('Error in API handler:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
