
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
        
        const stream = await ai.models.generateContentStream({ 
            model: 'gemini-2.5-flash', 
            contents: prompt,
            config: { thinkingConfig: { thinkingBudget: 0 } } // Keep it fast
        });
        
        // Set headers for streaming
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        for await (const chunk of stream) {
            if (chunk.text) {
                res.write(chunk.text);
            }
        }
        res.end();

    } catch (error) {
        console.error('Error in summarize route:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to summarize chat.' });
        } else {
            res.end();
        }
    }
}
