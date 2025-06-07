# School Discipline Chatbot Backend
# Run this with: python app.py

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import json
import uvicorn
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI(title="School Discipline Chatbot API")

# Enable CORS for local development and GitHub Pages
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Local development
        "https://coachcoe.github.io",  # GitHub Pages
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration from environment variables
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL_NAME = os.getenv("MODEL_NAME", "llama3:latest")
PORT = int(os.getenv("PORT", "8000"))

# System prompt for school discipline procedures
SYSTEM_PROMPT = """You are a helpful assistant specialized in guiding school personnel through discipline incident procedures. 

Your role is to:
1. Help users report and document discipline incidents properly
2. Guide them through required forms and procedures
3. Ensure proper timelines are followed
4. Identify who needs to be notified
5. Provide step-by-step guidance

Key areas you help with:
- Incident documentation and reporting
- Required forms (incident reports, suspension forms, etc.)
- Communication requirements (parents, administrators, district office)
- Timeline requirements for different types of incidents
- Follow-up procedures and monitoring

Ask clarifying questions to understand:
- What type of incident occurred
- Who was involved (students, staff)
- Severity level
- When and where it happened
- Any immediate actions already taken

Be thorough, professional, and ensure compliance with school policies. Always prioritize student safety and due process.

If you need specific policy details that aren't provided, guide the user to check their school's specific handbook or contact their administrator."""

class ChatMessage(BaseModel):
    message: str

class ChatResponse(BaseModel):
    response: str

@app.get("/")
async def root():
    """Root endpoint that serves the main HTML page"""
    return FileResponse("static/index.html")

@app.get("/health")
async def health_check():
    """Check if the server and Ollama are running"""
    try:
        # Test Ollama connection
        response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        if response.status_code == 200:
            return {"status": "healthy", "ollama": "connected"}
        else:
            return {"status": "partial", "ollama": "disconnected"}
    except requests.exceptions.RequestException:
        return {"status": "partial", "ollama": "disconnected"}

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(message: ChatMessage):
    """Main chat endpoint"""
    try:
        # Prepare the prompt with system context
        full_prompt = f"{SYSTEM_PROMPT}\n\nUser: {message.message}\n\nAssistant:"
        
        # Call Ollama API
        ollama_response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": MODEL_NAME,
                "prompt": full_prompt,
                "stream": False,
                "options": {
                    "temperature": 0.3,  # Lower temperature for more consistent responses
                    "top_p": 0.9,
                    "max_tokens": 1000
                }
            },
            timeout=60
        )
        
        if ollama_response.status_code != 200:
            raise HTTPException(status_code=500, detail="Error communicating with Ollama")
        
        response_data = ollama_response.json()
        bot_response = response_data.get("response", "Sorry, I couldn't generate a response.")
        
        return ChatResponse(response=bot_response)
        
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=503, 
            detail=f"Unable to connect to Ollama. Make sure Ollama is running on {OLLAMA_URL}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/models")
async def list_models():
    """List available models in Ollama"""
    try:
        response = requests.get(f"{OLLAMA_URL}/api/tags")
        if response.status_code == 200:
            return response.json()
        else:
            raise HTTPException(status_code=500, detail="Error fetching models from Ollama")
    except requests.exceptions.RequestException:
        raise HTTPException(status_code=503, detail="Unable to connect to Ollama")

if __name__ == "__main__":
    print("🏫 Starting School Discipline Chatbot Backend...")
    print(f"📡 Backend will run on: http://localhost:{PORT}")
    print(f"🤖 Ollama expected at: {OLLAMA_URL}")
    print(f"📝 Using model: {MODEL_NAME}")
    print("\nMake sure you have:")
    print("1. Ollama installed and running")
    print(f"2. The model '{MODEL_NAME}' downloaded")
    print("3. Open the HTML file in your browser")
    
    uvicorn.run(app, host="0.0.0.0", port=PORT)