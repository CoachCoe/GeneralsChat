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
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_URL = f"{OLLAMA_HOST}/api/generate"
MODEL_NAME = os.getenv("MODEL_NAME", "mistral")  # Default to mistral model
PORT = int(os.getenv("PORT", "8000"))

# Log configuration on startup
logger.info(f"Starting with model: {MODEL_NAME}")
logger.info(f"Ollama host: {OLLAMA_HOST}")

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
    """Check if the server and Ollama are accessible"""
    try:
        # Test Ollama connection
        response = requests.get(
            f"{OLLAMA_HOST}/api/tags",
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
        
        # Format the prompt to include context
        prompt = f"{system_prompt}\n\n{request.message}"
        
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "top_p": 0.95,
                    "max_tokens": 1000,
                    "context_window": 8192,  # Increased to Mistral's maximum
                    "num_ctx": 8192,  # Explicitly set context length
                    "repeat_penalty": 1.1  # Add penalty for repeating content
                }
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

@app.get("/test-ollama")
async def test_ollama():
    """Test endpoint to verify Ollama connection and model access"""
    try:
        # Test with the configured model
        test_model = MODEL_NAME
        logger.info(f"Testing with model: {test_model}")
        
        # First, check if we can access the model list
        model_list_url = f"{OLLAMA_HOST}/api/tags"
        logger.info(f"Checking model list at: {model_list_url}")
        
        model_response = requests.get(model_list_url, timeout=5)
        logger.info(f"Model list response status: {model_response.status_code}")
        logger.info(f"Model list response: {model_response.text[:200]}")
        
        # Try model inference
        prompt = "Hello, how are you?"
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": test_model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "top_p": 0.95,
                    "max_tokens": 100
                }
            },
            timeout=60
        )
        
        if response.status_code == 200:
            result = response.json()
            return {
                "status": "test_complete",
                "model_name": test_model,
                "model_list": {
                    "url": model_list_url,
                    "status_code": model_response.status_code,
                    "response": model_response.text[:200] if model_response.status_code == 200 else model_response.text
                },
                "inference_test": {
                    "response": result.get("response", "No response generated")
                }
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
    logger.info(f"🤖 Using Ollama model: {MODEL_NAME}")
    logger.info("\nMake sure you have:")
    logger.info("1. Ollama installed and running")
    logger.info("2. The model pulled (ollama pull mistral)")
    logger.info("3. Open the HTML file in your browser")
    
    uvicorn.run(app, host="0.0.0.0", port=PORT)