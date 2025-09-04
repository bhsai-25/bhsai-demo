
import { GoogleGenAI } from "@google/genai";
import type { VercelRequest, VercelResponse } from '@vercel/node';

// This runs on the server, so process.env.API_KEY is secure
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { message, history, systemInstruction, image, isGoogleSearchEnabled } = req.body;

        // --- Handle Google Search (non-streaming) ---
        if (isGoogleSearchEnabled && !image) {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: message,
                config: { tools: [{ googleSearch: {} }] }
            });
            // CORRECTED: Extract only the necessary data into a clean JSON object.
            return res.status(200).json({ 
                text: response.text, 
                candidates: response.candidates 
            });
        }

        // --- Handle Streaming for Chat and Images ---
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        // FIX: The `ai.models.create` method is deprecated.
        // Use `ai.models.generateContentStream` for streaming with images,
        // and `ai.chats.create` for streaming chat sessions.
        let stream;
        if (image) { 
             stream = await ai.models.generateContentStream({
                model: 'gemini-2.5-flash',
                contents: { parts: [image, { text: message }] }
            });
        } else {
            const chat = ai.chats.create({
                model: 'gemini-2.5-flash',
                config: { systemInstruction },
                history: history || [],
            });
            stream = await chat.sendMessageStream({ message });
        }
        
        // Stream the text chunks back to the client
        for await (const chunk of stream) {
            if(chunk.text) {
                res.write(chunk.text);
            }
        }
        res.end();

    } catch (error) {
        console.error('Error in API route:', error);
        res.status(500).json({ error: 'Failed to process chat message.' });
    }
}
