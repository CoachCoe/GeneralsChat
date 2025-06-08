# School Discipline Chatbot Backend
# Run this with: python app.py

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import json
import uvicorn
import os
import logging
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
MODEL_NAME = os.getenv("MODEL_NAME", "facebook/opt-350m")
PORT = int(os.getenv("PORT", "8000"))

# Log configuration on startup
logger.info(f"Starting with model: {MODEL_NAME}")
logger.info(f"HUGGINGFACE_API_KEY is {'set' if HUGGINGFACE_API_KEY else 'not set'}")

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

Start by asking the user questions to gather the necessary details
- When did this incident happen?
- Who reported it?
- Who are the witnesses?
- Start at the beginning and tell me what happened in as much detail as possihle. 

Be thorough, professional, and ensure compliance with school policies. Always prioritize student safety and due process.

If you need specific policy details that aren't provided, guide the user to check their school's specific handbook or contact their administrator."""

# Define request/response models
class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    response: str

@app.get("/health")
async def health_check():
    """Check if the server and Hugging Face API are accessible"""
    try:
        if not HUGGINGFACE_API_KEY:
            logger.error("HUGGINGFACE_API_KEY is not set")
            return {"status": "unhealthy", "huggingface": "api_key_missing"}
            
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
            logger.error(f"Hugging Face API returned status code: {response.status_code}")
            return {"status": "partial", "huggingface": "disconnected"}
    except requests.exceptions.RequestException as e:
        logger.error(f"Request exception in health check: {str(e)}")
        return {"status": "partial", "huggingface": "disconnected"}

@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        # Get API key from environment variable
        api_key = os.getenv("HUGGINGFACE_API_KEY")
        if not api_key:
            logger.error("HUGGINGFACE_API_KEY not set")
            raise HTTPException(status_code=500, detail="API key not configured")

        # Get model name from environment variable
        model_name = os.getenv("MODEL_NAME", "facebook/opt-350m")
        logger.info(f"Calling Hugging Face API with model: {model_name}")

        # Prepare the prompt
        prompt = f"Human: {request.message}\nAssistant:"

        # Make request to Hugging Face API
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        inference_url = f"https://api-inference.huggingface.co/models/{model_name}"
        
        logger.info(f"Making inference request to: {inference_url}")
        
        response = requests.post(
            inference_url,
            headers=headers,
            json={"inputs": prompt}
        )
        
        logger.info(f"Hugging Face API response status: {response.status_code}")
        logger.info(f"Response text: {response.text[:200]}...")  # Log first 200 chars of response
        
        if response.status_code == 200:
            try:
                response_data = response.json()
                if isinstance(response_data, list) and len(response_data) > 0:
                    generated_text = response_data[0].get('generated_text', '')
                    # Extract only the assistant's response
                    if "Assistant:" in generated_text:
                        response_text = generated_text.split("Assistant:")[-1].strip()
                    else:
                        response_text = generated_text
                    return {"response": response_text}
                else:
                    logger.error(f"Unexpected response format: {response_data}")
                    raise HTTPException(status_code=500, detail="Unexpected response format from API")
            except Exception as e:
                logger.error(f"Error processing response: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Error processing response: {str(e)}")
        else:
            error_msg = f"Error from Hugging Face API: {response.text}"
            logger.error(error_msg)
            raise HTTPException(status_code=500, detail=error_msg)
            
    except requests.exceptions.RequestException as e:
        logger.error(f"Request error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Request error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

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

@app.get("/test-huggingface")
async def test_huggingface():
    try:
        api_key = os.getenv("HUGGINGFACE_API_KEY")
        if not api_key:
            logger.error("HUGGINGFACE_API_KEY not set")
            return {"status": "error", "message": "API key not configured"}

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        # Test different endpoint formats
        test_urls = [
            "https://api-inference.huggingface.co/models/gpt2",
            "https://api-inference.huggingface.co/models/gpt2/generate",
            "https://api-inference.huggingface.co/pipeline/text-generation"
        ]

        results = []
        for url in test_urls:
            try:
                logger.info(f"Testing URL: {url}")
                response = requests.post(
                    url,
                    headers=headers,
                    json={"inputs": "Hello, how are you?"}
                )
                results.append({
                    "url": url,
                    "status_code": response.status_code,
                    "response": response.text[:200] if response.status_code == 200 else response.text,
                    "headers": dict(response.headers)
                })
            except Exception as e:
                results.append({
                    "url": url,
                    "error": str(e)
                })

        return {
            "status": "test_complete",
            "api_key_status": "set" if api_key else "not_set",
            "api_key_length": len(api_key) if api_key else 0,
            "results": results
        }

    except Exception as e:
        logger.error(f"Test error: {str(e)}")
        return {
            "status": "error",
            "message": str(e)
        }

if __name__ == "__main__":
    logger.info("🏫 Starting School Discipline Chatbot Backend...")
    logger.info(f"📡 Backend will run on: http://localhost:{PORT}")
    logger.info(f"🤖 Using Hugging Face model: {MODEL_NAME}")
    logger.info("\nMake sure you have:")
    logger.info("1. HUGGINGFACE_API_KEY environment variable set")
    logger.info("2. The model is available on Hugging Face")
    logger.info("3. Open the HTML file in your browser")
    
    uvicorn.run(app, host="0.0.0.0", port=PORT)