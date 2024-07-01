// pages/api/upload-image.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageData } = req.body;
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Create a unique filename
    const filename = `${uuidv4()}.jpg`;
    const filepath = path.join('/tmp', 'uploads', filename);

    // Ensure the uploads directory exists
    await fs.mkdir(path.join('/tmp', 'uploads'), { recursive: true });

    // Write the file
    await fs.writeFile(filepath, buffer);

    // Return the URL of the uploaded image
    const imageUrl = `/uploads/${filename}`;
    res.status(200).json({ imageUrl });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
}
