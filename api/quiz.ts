
import { GoogleGenAI, Type } from "@google/genai";
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { topic, systemInstruction, numQuestions, difficulty } = req.body;
        if (!topic || !systemInstruction || !numQuestions || !difficulty) {
            return res.status(400).json({ error: 'Topic, systemInstruction, numQuestions, and difficulty are required.' });
        }

        const validNumQuestions = [5, 10, 15, 20].includes(Number(numQuestions)) ? Number(numQuestions) : 5;

        // Define the expected JSON structure for a quiz dynamically
        const quizSchema = {
            type: Type.OBJECT,
            properties: {
                quiz: {
                    type: Type.ARRAY,
                    description: `An array of ${validNumQuestions} multiple-choice quiz questions.`,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            question: { type: Type.STRING, description: "The quiz question." },
                            options: {
                                type: Type.ARRAY,
                                description: "An array of 4 possible answers.",
                                items: { type: Type.STRING }
                            },
                            correctAnswerIndex: { type: Type.INTEGER, description: "The 0-based index of the correct answer in the 'options' array." },
                            explanation: { type: Type.STRING, description: "A brief explanation for why the correct answer is right." }
                        },
                        required: ["question", "options", "correctAnswerIndex", "explanation"]
                    }
                }
            },
            required: ["quiz"]
        };

        const prompt = `Generate a ${validNumQuestions}-question multiple-choice quiz about "${topic}" with a difficulty level of "${difficulty}". The questions should be strictly academic and appropriate for the student described in the system instruction. Ensure there are exactly 4 options for each question.`;
        
        // Use streaming to avoid serverless function timeouts
        const stream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: quizSchema,
            },
        });

        // Set headers for streaming the response
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Stream the JSON chunks back to the client
        for await (const chunk of stream) {
            if(chunk.text) {
                res.write(chunk.text);
            }
        }
        res.end();

    } catch (error) {
        console.error('Error in quiz generation route:', error);
        // Ensure headers are set for error messages if streaming has not started
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate quiz.' });
        } else {
            res.end();
        }
    }
}
