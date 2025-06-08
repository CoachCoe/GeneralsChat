# School Discipline Chatbot Backend
# Run this with: python app.py

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import os
import logging
import uvicorn
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Get environment variables
# Use Ollama local model
OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "mistral"  # Best open conversational model for local use
logger.info(f"Using Ollama model: {OLLAMA_MODEL}")
PORT = int(os.getenv("PORT", "8000"))

# Log configuration on startup
logger.info(f"Starting with model: {OLLAMA_MODEL}")

app = FastAPI(title="School Discipline Chatbot API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Local development
        "http://localhost:5174",  # Local development (alternate port)
        "https://coachcoe.github.io",  # GitHub Pages
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    systemPrompt: str | None = None

@app.get("/")
async def root():
    return {"message": "School Discipline Chatbot API"}

@app.get("/health")
async def health_check():
    """Check if the server and Ollama API are accessible"""
    try:
        # Test Ollama API connection
        response = requests.get(
            OLLAMA_URL,
            timeout=5
        )
        if response.status_code == 200:
            return {"status": "healthy", "ollama": "connected"}
        else:
            logger.error(f"Ollama API returned status code: {response.status_code}")
            return {"status": "partial", "ollama": "disconnected"}
    except requests.exceptions.RequestException as e:
        logger.error(f"Request exception in health check: {str(e)}")
        return {"status": "partial", "ollama": "disconnected"}

@app.post("/chat")
async def chat(request: ChatRequest):
    """Chat endpoint that uses Ollama for text generation"""
    try:
        if not request.message:
            return {"error": "No message provided"}
        
        # Use the provided system prompt or default
        system_prompt = request.systemPrompt or """You are a helpful AI assistant for school administrators. \
You help with discipline issues and provide guidance based on school policies."""
        
        prompt = f"{system_prompt}\nPlease respond to the following question: {request.message}"
        
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False
            },
            timeout=60
        )
        if response.status_code == 200:
            result = response.json()
            return {"response": result.get("response", "No response generated")}
        else:
            logger.error(f"Ollama API error: {response.status_code} - {response.text}")
            return {"error": f"Ollama API error: {response.status_code}"}
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        return {"error": str(e)}

@app.get("/test-huggingface")
async def test_ollama():
    """Test endpoint to verify Ollama connection and model access"""
    try:
        prompt = "Hello, how are you?"
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False
            },
            timeout=60
        )
        if response.status_code == 200:
            result = response.json()
            return {
                "status": "test_complete",
                "model_name": OLLAMA_MODEL,
                "response": result.get("response", "No response generated")
            }
        else:
            logger.error(f"Ollama API error: {response.status_code} - {response.text}")
            return {"error": f"Ollama API error: {response.status_code}"}
    except Exception as e:
        logger.error(f"Test error: {str(e)}")
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    logger.info("🏫 Starting School Discipline Chatbot Backend...")
    logger.info(f"📡 Backend will run on: http://localhost:{PORT}")
    logger.info(f"🤖 Using Ollama model: {OLLAMA_MODEL}")
    logger.info("\nMake sure you have:")
    logger.info("1. Ollama server running")
    logger.info("2. Open the HTML file in your browser")
    
    uvicorn.run(app, host="0.0.0.0", port=PORT)