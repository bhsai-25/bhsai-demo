
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
        
        let stream;
        if (image) { 
            // Build the conversation history with the new image message at the end.
            // This provides context for vision-related queries.
            const conversationHistory = (history || []).map((h: { role: any; parts: any; }) => ({
                role: h.role,
                parts: h.parts
            }));

            conversationHistory.push({
                role: 'user',
                parts: [image, { text: message }]
            });

             stream = await ai.models.generateContentStream({
                model: 'gemini-2.5-flash',
                contents: conversationHistory,
                config: { systemInstruction },
            });
        } else {
            const chat = ai.chats.create({
                model: 'gemini-2.5-flash',
                config: { systemInstruction },
                history: history || [],
            });
            // FIX: Pass the message string directly, not as an object.
            stream = await chat.sendMessageStream(message);
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