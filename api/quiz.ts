
import { GoogleGenAI, Type } from "@google/genai";
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

// Define the expected JSON structure for a quiz
const quizSchema = {
    type: Type.OBJECT,
    properties: {
        quiz: {
            type: Type.ARRAY,
            description: "An array of 5 multiple-choice quiz questions.",
            items: {
                type: Type.OBJECT,
                properties: {
                    question: {
                        type: Type.STRING,
                        description: "The quiz question."
                    },
                    options: {
                        type: Type.ARRAY,
                        description: "An array of 4 possible answers.",
                        items: {
                            type: Type.STRING
                        }
                    },
                    correctAnswerIndex: {
                        type: Type.INTEGER,
                        description: "The 0-based index of the correct answer in the 'options' array."
                    },
                    explanation: {
                        type: Type.STRING,
                        description: "A brief explanation for why the correct answer is right."
                    }
                },
                required: ["question", "options", "correctAnswerIndex", "explanation"]
            }
        }
    },
    required: ["quiz"]
};


export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { topic, systemInstruction } = req.body;
        if (!topic || !systemInstruction) {
            return res.status(400).json({ error: 'Topic and systemInstruction are required.' });
        }

        const prompt = `Generate a 5-question multiple-choice quiz about "${topic}". The questions should be strictly academic and appropriate for the student described in the system instruction. Ensure there are exactly 4 options for each question.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: quizSchema,
            },
        });

        // The response.text should be a JSON string that conforms to the schema
        const quizData = JSON.parse(response.text);
        
        res.status(200).json(quizData);

    } catch (error) {
        console.error('Error in quiz generation route:', error);
        res.status(500).json({ error: 'Failed to generate quiz.' });
    }
}
