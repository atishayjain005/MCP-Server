import { config } from 'dotenv';
import readline from 'readline/promises'
import { GoogleGenAI } from "@google/genai"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"


config()
let tools = []
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const mcpClient = new Client({
    name: 'streamable-http-client',
    version: '1.0.0'
})



const chatHistory = [];
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});


mcpClient.connect(new SSEClientTransport(new URL("http://localhost:3000/sse")))
    .then(async () => {

        console.log("Connected to mcp server")

        tools = (await mcpClient.listTools()).tools.map(tool => {
            return {
                name: tool.name,
                description: tool.description,
                parameters: {
                    type: tool.inputSchema.type,
                    properties: tool.inputSchema.properties,
                    required: tool.inputSchema.required
                }
            }
        })

        console.log("Available tools:", tools.map(tool => tool.name))
        chatLoop()


    })

async function chatLoop(toolCall) {

    if (toolCall) {

        console.log("calling tool ", toolCall.name)

        chatHistory.push({
            role: "model",
            parts: [
                {
                    text: `calling tool ${toolCall.name}`,
                    type: "text"
                }
            ]
        })

        try {
            // Fix: Use the proper arguments structure based on the function name
            let toolArgs = {};
            
            if (toolCall.name === 'createPost') {
                // Extract status text from different possible argument formats
                let statusText = '';
                
                if (toolCall.args.status) {
                    // Direct status parameter
                    statusText = toolCall.args.status;
                } else if (toolCall.args.text) {
                    // Text parameter
                    statusText = toolCall.args.text;
                } else if (toolCall.args.content) {
                    // Content parameter
                    statusText = toolCall.args.content;
                } else if (toolCall.args.message) {
                    // Message parameter
                    statusText = toolCall.args.message;
                } else if (typeof toolCall.args === 'object') {
                    // If args is an object with no recognized fields, 
                    // stringify it or look for any string property
                    const stringProps = Object.entries(toolCall.args)
                        .filter(([_, v]) => typeof v === 'string')
                        .map(([_, v]) => v);
                    
                    if (stringProps.length > 0) {
                        // Use the longest string property as it's likely the content
                        statusText = stringProps.reduce((a, b) => 
                            a.length > b.length ? a : b);
                    } else {
                        statusText = JSON.stringify(toolCall.args);
                    }
                } else if (typeof toolCall.args === 'string') {
                    // If args is directly a string
                    statusText = toolCall.args;
                } else {
                    // Last resort
                    statusText = JSON.stringify(toolCall.args);
                }
                
                // Process the text to remove any markdown or unwanted formatting
                statusText = statusText.replace(/^\*\*X Post:\*\*\n\n/g, ''); // Remove "X Post:" header
                statusText = statusText.replace(/\n\*   /g, '\n• '); // Convert markdown bullets to unicode bullets
                
                toolArgs = { status: statusText };
                console.log("Posting to Twitter with status:", toolArgs.status);
            } else {
                // For other tools, pass the args directly
                toolArgs = toolCall.args;
            }
            
            console.log("Tool arguments:", JSON.stringify(toolArgs, null, 2))
            
            const toolResult = await mcpClient.callTool({
                name: toolCall.name,
                arguments: toolArgs
            })

            console.log("Tool result:", JSON.stringify(toolResult, null, 2));
            
            // Check for error message in the response
            const resultText = toolResult.content[0].text;
            if (resultText.includes("Error") || resultText.includes("error")) {
                console.log("Tool error detected:", resultText);
                
                // Special handling for rate limit errors
                if (resultText.includes("rate limit") || resultText.includes("429")) {
                    console.log("Rate limit detected, adding special flag to chat history");
                    // Add rate limit flag to prevent retry loops
                    chatHistory.push({
                        role: "user",
                        parts: [
                            {
                                text: "Tool error: " + resultText + " (RATE_LIMITED)",
                                type: "text"
                            }
                        ]
                    });
                } else {
                    chatHistory.push({
                        role: "user",
                        parts: [
                            {
                                text: "Tool error: " + resultText,
                                type: "text"
                            }
                        ]
                    });
                }
            } else {
                chatHistory.push({
                    role: "user",
                    parts: [
                        {
                            text: "Tool result: " + resultText,
                            type: "text"
                        }
                    ]
                });
            }
        } catch (error) {
            console.error("Error calling tool:", error);
            chatHistory.push({
                role: "user",
                parts: [
                    {
                        text: "Tool error: " + error.message,
                        type: "text"
                    }
                ]
            });
        }

    } else {
        const question = await rl.question('You: ');
        chatHistory.push({
            role: "user",
            parts: [
                {
                    text: question,
                    type: "text"
                }
            ]
        })
    }

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
        })
        
        // Enhanced debugging
        console.log("Full response:", JSON.stringify(response, null, 2))
        console.log("Response candidates:", JSON.stringify(response.candidates[0].content.parts, null, 2))
        
        const part = response.candidates[0].content.parts[0];
        console.log("First part type:", part.text ? "text" : (part.functionCall ? "functionCall" : "unknown"))
        
        const functionCall = part.functionCall;
        const responseText = part.text;

        if (functionCall) {
            console.log("Function call detected:", JSON.stringify(functionCall, null, 2))
            return chatLoop(functionCall)
        } else {
            console.log("No function call detected, responding with text instead")
            
            // Check if the user's last message was about posting to Twitter/X
            const lastUserMessage = chatHistory.filter(msg => msg.role === "user").pop();
            if (lastUserMessage && lastUserMessage.parts && lastUserMessage.parts.length > 0) {
                const userText = lastUserMessage.parts[0].text.toLowerCase();
                
                // Check if this was an original request (not about a Twitter error)
                const isOriginalRequest = !userText.includes("error") && !userText.includes("tool error") && !userText.includes("rate_limited");
                
                // Additional check for rate limit flags in chat history
                const hasRateLimitFlag = chatHistory.some(msg => 
                    msg.role === "user" && 
                    msg.parts && 
                    msg.parts.some(part => 
                        part.text && part.text.toLowerCase().includes("rate_limited")
                    )
                );
                
                // Check for Twitter-related keywords
                const isTwitterPostRequest = 
                    (userText.includes("post") || userText.includes("tweet") || userText.includes("share")) && 
                    (userText.includes("twitter") || userText.includes(" x ") || 
                     userText.includes("x post") || userText.endsWith("x") || 
                     userText.includes("social media"));
                
                // Only make the function call for original Twitter requests, not for error responses,
                // and not if we've already hit a rate limit
                if (isOriginalRequest && !hasRateLimitFlag && isTwitterPostRequest && responseText && responseText.length > 0) {
                    console.log("Detected Twitter post request without function call, posting AI's response");
                    
                    // Since the AI generated content instead of making a function call,
                    // we'll post the AI's response to Twitter
                    return chatLoop({
                        name: "createPost",
                        args: { status: responseText }
                    });
                }
            }
        }

        chatHistory.push({
            role: "model",
            parts: [
                {
                    text: responseText,
                    type: "text"
                }
            ]
        })

        console.log(`AI: ${responseText}`)
    } catch (error) {
        console.error("Error generating content:", error);
        console.log("AI: Sorry, I encountered an error. Please try again.");
    }

    chatLoop()
}
