

import { GoogleGenAI, Content } from "@google/genai";
import type { VercelRequest, VercelResponse } from '@vercel/node';

// This runs on the server, so process.env.API_KEY is secure
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { message, history, systemInstruction, image, isGoogleSearchEnabled } = req.body;

        // The history from the client is already in the correct format.
        const conversationHistory: Content[] = history || [];

        // Add the current user message to the history.
        if (image) {
            conversationHistory.push({
                role: 'user',
                parts: [image, { text: message }]
            });
        } else {
            conversationHistory.push({
                role: 'user',
                parts: [{ text: message }]
            });
        }

        // --- Handle Google Search (non-streaming) ---
        if (isGoogleSearchEnabled && !image) {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: conversationHistory, // Pass the full conversation history
                config: { tools: [{ googleSearch: {} }] }
            });
            // Extract only the necessary data into a clean JSON object.
            return res.status(200).json({ 
                text: response.text, 
                candidates: response.candidates 
            });
        }

        // --- Handle Streaming for Chat and Images ---
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        const stream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: conversationHistory, // History is already prepared
            config: { systemInstruction },
        });
        
        // Stream the text chunks back to the client
        for await (const chunk of stream) {
            if(chunk.text) {
                res.write(chunk.text);
            }
        }
        res.end();

    } catch (error) {
        console.error('Error in API route:', error);
        // Ensure that if headers are already sent, we don't try to send JSON
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to process chat message.' });
        } else {
            // If headers are sent (i.e., we are streaming), we can't send a JSON error.
            // We just end the response. The client will have to handle the abrupt end.
            res.end();
        }
    }
}