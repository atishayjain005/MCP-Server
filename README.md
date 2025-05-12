# MCP (Model Context Protocol)

A client-server application that integrates with Twitter and Google's Gemini AI to create an interactive AI-powered social media assistant.

## Technologies Used

### Backend (Server)
- Node.js with Express.js
- TypeScript
- Twitter API v2
- Model Context Protocol (MCP) SDK
- Zod for schema validation

### Frontend (Client)
- Node.js
- Google's Gemini AI API
- Model Context Protocol (MCP) SDK
- dotenv for environment variables

## Prerequisites

- Node.js (v14 or higher)
- Twitter Developer Account with API credentials
- Google Cloud Project with Gemini API access

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   # Install server dependencies
   cd server
   npm install

   # Install client dependencies
   cd ../client
   npm install
   ```

3. Create `.env` files in both client and server directories with the following variables:

   Server `.env`:
   ```
   TWITTER_API_KEY=your_twitter_api_key
   TWITTER_API_SECRET=your_twitter_api_secret
   TWITTER_ACCESS_TOKEN=your_twitter_access_token
   TWITTER_ACCESS_SECRET=your_twitter_access_secret
   ```

   Client `.env`:
   ```
   GEMINI_API_KEY=your_gemini_api_key
   ```

## Running the Application

1. Start the server:
   ```bash
   cd server
   npm start
   ```

2. Start the client:
   ```bash
   cd client
   node index.js
   ```

The server will run on http://localhost:3000 by default.

## Features

- Integration with Twitter API for posting tweets
- AI-powered responses using Google's Gemini
- Model Context Protocol for standardized AI interactions
- Automatic tweet length validation and truncation
- Error handling and rate limiting protection
- Interactive chat interface for AI interactions

## Project Structure

```
MCP/
├── client/
│   ├── index.js           # Main client application
│   └── gemini-test.js     # Gemini API testing
├── server/
│   ├── index.js           # Express server setup
│   └── mcp.tool.js        # MCP tool implementations
└── README.md
```

## Core Components

### Server (`server/`)
- `index.js`: Sets up the Express server and MCP server, defines available tools
- `mcp.tool.js`: Implements Twitter integration with rate limiting and error handling

### Client (`client/`)
- `index.js`: Main client application with chat interface and AI integration
- `gemini-test.js`: Test file for Gemini API integration

## Features in Detail

### Twitter Integration
- Automatic tweet length validation (280 character limit)
- Rate limit handling with exponential backoff
- Markdown formatting removal
- Error handling for API failures

### AI Integration
- Interactive chat interface
- Context-aware responses
- Automatic tool selection based on user input
- Error handling and retry mechanisms

### Security Features
- Environment variable based configuration
- API key management
- Rate limiting protection
- Input validation using Zod

## Error Handling

The application includes comprehensive error handling for:
- API rate limits
- Invalid tweet lengths
- Network connectivity issues
- Authentication failures
- AI response generation errors

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request
