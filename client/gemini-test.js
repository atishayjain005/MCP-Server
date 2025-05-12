import { config } from 'dotenv';
import { GoogleGenAI } from "@google/genai";

config();

// Initialize the GoogleAI instance with your API key
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testAiGeneration() {
    // Simulate the tools structure the client app uses
    const tools = [
        {
            name: "addTwoNumbers",
            description: "Add two numbers",
            parameters: {
                type: "object",
                properties: {
                    a: { type: "number" },
                    b: { type: "number" }
                },
                required: ["a", "b"]
            }
        },
        {
            name: "createPost",
            description: "Create a post on X formally known as Twitter",
            parameters: {
                type: "object",
                properties: {
                    status: { type: "string" }
                },
                required: ["status"]
            }
        }
    ];

    // Create a chat history similar to what the app would have
    const chatHistory = [
        {
            role: "user",
            parts: [
                {
                    text: "Post to Twitter saying 'Testing the Twitter API integration'",
                    type: "text"
                }
            ]
        }
    ];

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: chatHistory,
            config: {
                tools: [
                    {
                        functionDeclarations: tools,
                    }
                ]
            }
        });

        const functionCall = response.candidates[0].content.parts[0].functionCall;
        const responseText = response.candidates[0].content.parts[0].text;

        console.log("Response text:", responseText);
        console.log("Function call:", functionCall ? JSON.stringify(functionCall, null, 2) : "No function call");
    } catch (error) {
        console.error("Error calling Gemini API:", error);
    }
}

testAiGeneration(); 