
import { GoogleGenAI } from "@google/genai";
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { conversation } = req.body;
        if (!conversation) {
            return res.status(400).json({ error: 'Conversation history is required.' });
        }

        const prompt = `Based on the following conversation, create a very short, concise title (maximum 5 words, e.g., "Solar System Explained"). Do not use quotes in the title.\n\n---\n${conversation}\n---`;
        
        const response = await ai.models.generateContent({ 
            model: 'gemini-2.5-flash', 
            contents: prompt,
            // Disable thinking for this simple, fast task.
            config: { thinkingConfig: { thinkingBudget: 0 } }
        });
        
        // Clean up the title - remove quotes and extra whitespace
        const title = response.text.replace(/["']/g, '').trim();

        res.status(200).json({ title });

    } catch (error) {
        console.error('Error in title route:', error);
        res.status(500).json({ error: 'Failed to generate title.' });
    }
}
