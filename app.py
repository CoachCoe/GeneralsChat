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
HUGGINGFACE_API_KEY = os.getenv("HUGGINGFACE_API_KEY")
MODEL_NAME = os.getenv("MODEL_NAME", "mistralai/Mistral-7B-Instruct-v0.2")
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

@app.get("/health")
async def health_check():
    """Check if the server and Hugging Face API are accessible"""
    try:
        # Test Hugging Face API connection
        headers = {"Authorization": f"Bearer {HUGGINGFACE_API_KEY}"}
        response = requests.get(
            "https://api-inference.huggingface.co/status",
            headers=headers,
            timeout=5
        )
        if response.status_code == 200:
            return {"status": "healthy", "huggingface": "connected"}
        else:
            return {"status": "partial", "huggingface": "disconnected"}
    except requests.exceptions.RequestException:
        return {"status": "partial", "huggingface": "disconnected"}

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(message: ChatMessage):
    """Main chat endpoint"""
    if not HUGGINGFACE_API_KEY:
        print("Error: HUGGINGFACE_API_KEY is not set")
        raise HTTPException(
            status_code=500,
            detail="HUGGINGFACE_API_KEY environment variable is not set"
        )

    try:
        # Prepare the prompt with system context
        full_prompt = f"{SYSTEM_PROMPT}\n\nUser: {message.message}\n\nAssistant:"
        
        # Call Hugging Face API
        headers = {"Authorization": f"Bearer {HUGGINGFACE_API_KEY}"}
        print(f"Calling Hugging Face API with model: {MODEL_NAME}")
        response = requests.post(
            f"https://api-inference.huggingface.co/models/{MODEL_NAME}",
            headers=headers,
            json={
                "inputs": full_prompt,
                "parameters": {
                    "temperature": 0.3,
                    "top_p": 0.9,
                    "max_new_tokens": 1000,
                    "return_full_text": False
                }
            },
            timeout=60
        )
        
        if response.status_code != 200:
            print(f"Error from Hugging Face API: {response.status_code}")
            print(f"Response text: {response.text}")
            raise HTTPException(
                status_code=500,
                detail=f"Error from Hugging Face API: {response.text}"
            )
        
        response_data = response.json()
        if isinstance(response_data, list) and len(response_data) > 0:
            bot_response = response_data[0].get("generated_text", "Sorry, I couldn't generate a response.")
        else:
            print(f"Unexpected response format: {response_data}")
            bot_response = "Sorry, I couldn't generate a response."
        
        return ChatResponse(response=bot_response)
        
    except requests.exceptions.RequestException as e:
        print(f"Request exception: {str(e)}")
        raise HTTPException(
            status_code=503,
            detail=f"Unable to connect to Hugging Face API: {str(e)}"
        )
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/models")
async def list_models():
    """List available models in Hugging Face"""
    try:
        response = requests.get(
            f"https://api-inference.huggingface.co/models/{MODEL_NAME}",
            headers={"Authorization": f"Bearer {HUGGINGFACE_API_KEY}"}
        )
        if response.status_code == 200:
            return response.json()
        else:
            raise HTTPException(status_code=500, detail="Error fetching models from Hugging Face")
    except requests.exceptions.RequestException:
        raise HTTPException(status_code=503, detail="Unable to connect to Hugging Face")

if __name__ == "__main__":
    print("🏫 Starting School Discipline Chatbot Backend...")
    print(f"📡 Backend will run on: http://localhost:{PORT}")
    print(f"🤖 Using Hugging Face model: {MODEL_NAME}")
    print("\nMake sure you have:")
    print("1. HUGGINGFACE_API_KEY environment variable set")
    print("2. The model is available on Hugging Face")
    print("3. Open the HTML file in your browser")
    
    uvicorn.run(app, host="0.0.0.0", port=PORT)