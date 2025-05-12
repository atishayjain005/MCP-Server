import { config } from "dotenv"
import { TwitterApi } from "twitter-api-v2"
config()

// Track rate limit information
const rateLimitInfo = {
    resetTime: null,
    isLimited: false,
    retryCount: 0,
    lastRequestTime: 0
}

const twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET
})

export async function createPost(status) {
    try {
        const now = Date.now();
        
        // Check if we're in a rate limited state
        if (rateLimitInfo.isLimited) {
            if (rateLimitInfo.resetTime && now < rateLimitInfo.resetTime) {
                const waitTime = Math.ceil((rateLimitInfo.resetTime - now) / 1000);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Twitter rate limit in effect. Please try again in ${waitTime} seconds.`
                        }
                    ]
                };
            } else {
                // Reset the rate limit if the reset time has passed
                rateLimitInfo.isLimited = false;
                rateLimitInfo.retryCount = 0;
            }
        }
        
        // Enforce minimum delay between requests (1 second)
        const timeSinceLastRequest = now - rateLimitInfo.lastRequestTime;
        if (timeSinceLastRequest < 1000) {
            await new Promise(resolve => setTimeout(resolve, 1000 - timeSinceLastRequest));
        }
        
        // Log the status to debug
        console.log("Attempting to tweet with status:", status);
        console.log("Status length:", status.length);
        
        // Twitter API limit is 280 characters
        if (status.length > 280) {
            console.log("Status exceeds 280 character limit, truncating...");
            status = status.substring(0, 277) + "...";
        }
        
        // Remove markdown formatting that might cause issues
        status = status.replace(/\*\*/g, ''); // Remove bold markdown
        status = status.replace(/\*/g, '');   // Remove italic markdown
        
        console.log("Cleaned status:", status);
        console.log("Cleaned status length:", status.length);
        
        rateLimitInfo.lastRequestTime = Date.now();
        const newPost = await twitterClient.v2.tweet(status);
        console.log("Tweet successful:", newPost);
        
        // Reset retry count on success
        rateLimitInfo.retryCount = 0;
        rateLimitInfo.isLimited = false;

        return {
            content: [
                {
                    type: "text",
                    text: `Tweeted: ${status}`
                }
            ]
        }
    } catch (error) {
        console.error("Error posting to Twitter:", error);
        
        // Handle rate limiting (429 errors)
        if (error.code === 429 || (error.message && error.message.includes('429'))) {
            rateLimitInfo.retryCount++;
            
            // Set exponential backoff
            const backoffTime = Math.min(60 * 15, Math.pow(2, rateLimitInfo.retryCount) * 1000);
            rateLimitInfo.isLimited = true;
            rateLimitInfo.resetTime = Date.now() + backoffTime;
            
            return {
                content: [
                    {
                        type: "text",
                        text: `Twitter rate limit exceeded. Please wait ${Math.ceil(backoffTime/1000)} seconds before trying again. This is a temporary restriction from Twitter's API.`
                    }
                ]
            };
        }
        
        return {
            content: [
                {
                    type: "text",
                    text: `Error posting to Twitter: ${error.message}`
                }
            ]
        }
    }
}