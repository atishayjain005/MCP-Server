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

        chatLoop()
    })

async function chatLoop(toolCall) {

    if (toolCall) {
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
                
                // Remove common introductory phrases
                statusText = statusText.replace(/^(?:Okay|Ok|Sure|Here|Alright)[,.]?\s+(?:here's|here is|I'll create).*?(?:post|tweet|content).*?[:.]\s*/i, '');
                statusText = statusText.replace(/^["']|["']$/g, ''); // Remove surrounding quotes if present
                statusText = statusText.replace(/^(?:Here's|This is) (?:a|an|my).*?(?:post|tweet).*?[:.]\s*/i, '');
                statusText = statusText.replace(/^\s*(?:post|tweet|share) (?:about|on|for).*?[:.]\s*/i, '');
                
                // Extract text after a colon if the user provided content in that format
                if (statusText.includes(':')) {
                    const colonIndex = statusText.indexOf(':');
                    const beforeColon = statusText.substring(0, colonIndex).toLowerCase();
                    // Only extract after colon if what's before seems like a posting instruction
                    if (beforeColon.includes('post') || beforeColon.includes('tweet') || 
                        beforeColon.includes('share') || beforeColon.includes('x')) {
                        statusText = statusText.substring(colonIndex + 1).trim();
                    }
                }
                
                // Filter out AI prompting requests and meta-text
                if (statusText.match(/(?:please|kindly)?\s*(?:provide|give|share|tell me|what is|send).*?(?:content|text|post|tweet|message)/i) ||
                    statusText.match(/I need.*?(?:content|text|post|tweet|message)/i) ||
                    statusText.match(/(?:what|how) would you like.*?(?:post|tweet|share)/i)) {
                    return chatLoop(); // Skip this post and continue conversation
                }
                
                toolArgs = { status: statusText };
            } else {
                // For other tools, pass the args directly
                toolArgs = toolCall.args;
            }
            
            const toolResult = await mcpClient.callTool({
                name: toolCall.name,
                arguments: toolArgs
            })
            
            // Check for error message in the response
            const resultText = toolResult.content[0].text;
            if (resultText.includes("Error") || resultText.includes("error")) {
                // Special handling for rate limit errors
                if (resultText.includes("rate limit") || resultText.includes("429")) {
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
        
        const part = response.candidates[0].content.parts[0];
        const functionCall = part.functionCall;
        const responseText = part.text;

        if (functionCall) {
            return chatLoop(functionCall)
        } else {
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
                
                // Check for explicit Twitter posting requests
                const isExplicitTweetRequest = 
                    (userText.includes("post") || userText.includes("tweet") || userText.includes("share")) && 
                    (userText.includes("twitter") || userText.includes(" x ") || 
                     userText.includes("x post") || userText.endsWith("x") || 
                     userText.includes("social media")) &&
                    // Make sure it's not asking for information about posting
                    !userText.includes("how") &&
                    !userText.includes("?") &&
                    !userText.includes("guide") &&
                    !userText.includes("help") &&
                    !userText.includes("explain");
                
                // Check for requests where user wants Gemini to write content
                const isContentGenerationRequest = 
                    isExplicitTweetRequest && 
                    (userText.includes("write") || userText.includes("generate") || 
                     userText.includes("create") || userText.includes("compose") ||
                     userText.includes("draft") || userText.includes("make"));
                
                // Skip posts that are prompting for content unless we're in content generation mode
                const isPromptingText = responseText && (
                    responseText.match(/(?:please|kindly)?\s*(?:provide|give|share|tell me|what is|send).*?(?:content|text|post|tweet|message)/i) ||
                    responseText.match(/I need.*?(?:content|text|post|tweet|message)/i) ||
                    responseText.match(/(?:what|how) would you like.*?(?:post|tweet|share)/i)
                );
                
                // Don't filter out AI prompting text if the user explicitly asked for content generation
                const shouldFilterPromptingText = !isContentGenerationRequest && isPromptingText;
                
                // Only make the function call for original Twitter requests, not for error responses,
                // not if we've already hit a rate limit, and apply prompting filter conditionally
                if (isOriginalRequest && !hasRateLimitFlag && isExplicitTweetRequest && 
                    responseText && responseText.length > 0 && !shouldFilterPromptingText) {
                    
                    // Process the response text to extract just the content
                    let contentToPost = responseText;
                    
                    // Extract text after a colon if the AI provided content in that format
                    if (contentToPost.includes(':')) {
                        const colonIndex = contentToPost.indexOf(':');
                        const beforeColon = contentToPost.substring(0, colonIndex).toLowerCase();
                        // Only extract after colon if what's before seems like a posting instruction
                        if (beforeColon.includes('post') || beforeColon.includes('tweet') || 
                            beforeColon.includes('share') || beforeColon.includes('content')) {
                            contentToPost = contentToPost.substring(colonIndex + 1).trim();
                        }
                    }
                    
                    // Remove common introductory phrases
                    contentToPost = contentToPost.replace(/^(?:Okay|Ok|Sure|Here|Alright)[,.]?\s+(?:here's|here is|I'll create).*?(?:post|tweet|content).*?[:.]\s*/i, '');
                    contentToPost = contentToPost.replace(/^["']|["']$/g, ''); // Remove surrounding quotes if present
                    contentToPost = contentToPost.replace(/^(?:Here's|This is) (?:a|an|my).*?(?:post|tweet).*?[:.]\s*/i, '');
                    
                    // Since the AI generated content instead of making a function call,
                    // we'll post the cleaned response to Twitter
                    return chatLoop({
                        name: "createPost",
                        args: { status: contentToPost }
                    });
                }
                
                // Handle follow-up content requests from user after AI has asked for specifics
                const previousMessage = chatHistory.length >= 2 ? 
                    chatHistory[chatHistory.length - 2] : null;
                
                if (previousMessage && previousMessage.role === "model" && 
                    isOriginalRequest && responseText && responseText.length > 0) {
                    
                    // Check if previous message was requesting content details
                    const prevText = previousMessage.parts[0].text.toLowerCase();
                    const wasAskingForContent = 
                        prevText.includes("provide") && prevText.includes("content") ||
                        prevText.includes("what") && prevText.includes("like") && 
                        (prevText.includes("post") || prevText.includes("tweet"));
                    
                    if (wasAskingForContent) {
                        // Extract the content to post, ensuring we're just getting the user's content
                        let contentToPost = responseText;
                        
                        // Since this is a direct response to an AI question, use it directly
                        return chatLoop({
                            name: "createPost",
                            args: { status: contentToPost }
                        });
                    }
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

    // Start a new prompt cycle instead of recursively calling
    setTimeout(() => { chatLoop(); }, 100);
    return;
}
