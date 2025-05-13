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
        
        // Twitter API limit is 280 characters
        if (status.length > 280) {
            // Try to find a natural breakpoint first (sentence end)
            let truncatedStatus = status;
            
            // Look for the last sentence break within the limit
            const lastPeriodIndex = status.lastIndexOf('.', 270);
            const lastExclamationIndex = status.lastIndexOf('!', 270);
            const lastQuestionIndex = status.lastIndexOf('?', 270);
            
            // Find the last sentence ending mark within reasonable range of the limit
            let lastSentenceEndIndex = Math.max(lastPeriodIndex, lastExclamationIndex, lastQuestionIndex);
            
            if (lastSentenceEndIndex > 180) {
                // If we found a reasonable sentence end, use it (and add 1 to include the punctuation)
                truncatedStatus = status.substring(0, lastSentenceEndIndex + 1);
            } else {
                // Otherwise, use a hard truncation but try to avoid cutting words
                const lastSpaceIndex = status.lastIndexOf(' ', 276);
                if (lastSpaceIndex > 250) {
                    // Use word boundary if reasonably close to limit
                    truncatedStatus = status.substring(0, lastSpaceIndex) + "...";
                } else {
                    // Last resort: hard truncation
                    truncatedStatus = status.substring(0, 277) + "...";
                }
            }
            
            status = truncatedStatus;
        }
        
        // Remove markdown formatting that might cause issues
        status = status.replace(/\*\*/g, ''); // Remove bold markdown
        status = status.replace(/\*/g, '');   // Remove italic markdown
        
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
        
        // Handle permission errors (403 Forbidden)
        if (error.code === 403 || (error.message && error.message.includes('403'))) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Permission error (403 Forbidden): Your Twitter API account doesn't have permission to post tweets. Check your API keys and make sure your developer account has "Read and Write" permissions enabled. Visit https://developer.twitter.com/en/portal/dashboard to update your app permissions.`
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