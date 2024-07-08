import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fs from 'fs/promises';



class Api {
  static async spec(req: NextApiRequest, res: NextApiResponse) {
    res.json({
      json_schema: {
        type: 'function',
        function: {
          name: 'imageProcessing',
          description: 'Analyzes an image/ a picture and returns a description of its content to answer user questions.',
          parameters: {
            type: 'object',
            properties: {
              url: {
                description: "URL of the image to process",
                type: 'string'
              },
              question: {
                description: "Question about the image content",
                type: 'string'
              }
            },
            required: [
              'url',
              'question'
            ]
          }
        }
      }
    });
  }

  static async call(req: NextApiRequest, res: NextApiResponse) {
    const { args } = req.query;
    const jsonObj = JSON.parse(args as string);
    if (!jsonObj || typeof jsonObj !== 'object' || !('url' in jsonObj) || !('question' in jsonObj)) {
      throw new Error(`Cannot parse image processing arguments: ${args}`);
    }

    const { url, question } = jsonObj;

    const imagePath = path.join('/tmp', url);
    const imageBuffer = await fs.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = 'image/jpeg'; // Adjust if you're using different image types
    const dataUrl = `data:${mimeType};base64,${base64Image}`;


    // Replace this URL with your actual Fireworks API endpoint for image processing
    const baseApiUrl = 'https://api.fireworks.ai/inference/v1/chat/completions';
    const modelId = process.env.FIREWORKS_VISION_MODEL;
    const apiKey = process.env.FIREWORKS_API_KEY;

    const response = await fetch(`${baseApiUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: question
              },
              {
                type: "image_url",
                image_url: {
                  url: dataUrl
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error processing image: ${await response.text()}`);
    }

    const data = await response.json();
    res.json({ result: data.choices[0].message.content });
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { action } = req.query;
  try {
    if (action === 'spec') {
      return Api.spec(req, res);
    } else if (action === 'call') {
      return Api.call(req, res);
    } else {
      res.status(404).json({ error: 'Action not found' });
    }
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      res.status(500).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'An internal server error occurred' });
    }
  }
}

