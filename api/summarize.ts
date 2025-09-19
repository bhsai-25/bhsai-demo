import { GoogleGenAI } from "@google/genai";
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { conversation } = req.body;
        const prompt = `Please provide a concise summary of the key points and topics from the following conversation:\n\n---\n${conversation}\n---`;
        
        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        
        res.status(200).json({ summary: response.text });

    } catch (error) {
        console.error('Error in summarize route:', error);
        res.status(500).json({ error: 'Failed to summarize chat.' });
    }
}
