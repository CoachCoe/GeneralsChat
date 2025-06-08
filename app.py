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
    """Chat endpoint that uses Hugging Face API"""
    try:
        if not HUGGINGFACE_API_KEY:
            raise HTTPException(status_code=500, detail="HUGGINGFACE_API_KEY is not set")
            
        print(f"Calling Hugging Face API with model: {MODEL_NAME}")
        
        # Prepare the request to Hugging Face
        headers = {
            "Authorization": f"Bearer {HUGGINGFACE_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # Format the prompt for the model
        prompt = f"""You are a helpful AI assistant for school administrators. 
        You help with discipline issues and provide guidance based on school policies.
        Please respond to the following question: {request.message}"""
        
        # Make the request to Hugging Face inference endpoint
        inference_url = "https://api-inference.huggingface.co/models/gpt2"
        print(f"Making inference request to: {inference_url}")
        
        response = requests.post(
            inference_url,
            headers=headers,
            json=prompt
        )
        
        print(f"Hugging Face API response status: {response.status_code}")
        print(f"Response text: {response.text[:200]}...")  # Print first 200 chars
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail=f"Error from Hugging Face API: {response.text}"
            )
            
        try:
            result = response.json()
            if isinstance(result, list) and len(result) > 0:
                generated_text = result[0].get("generated_text", "")
                # Extract the response after the prompt
                response_text = generated_text[len(prompt):].strip()
                return {"response": response_text}
            else:
                raise HTTPException(
                    status_code=500,
                    detail="Unexpected response format from Hugging Face API"
                )
        except ValueError as e:
            print(f"Error parsing JSON response: {str(e)}")
            print(f"Raw response: {response.text}")
            raise HTTPException(
                status_code=500,
                detail="Error parsing response from Hugging Face API"
            )
            
    except requests.exceptions.RequestException as e:
        print(f"Request error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error making request to Hugging Face API: {str(e)}"
        )
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        )

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
    """Test endpoint to verify Hugging Face API connection"""
    print("Testing Hugging Face API connection...")
    
    if not HUGGINGFACE_API_KEY:
        print("Error: HUGGINGFACE_API_KEY is not set")
        return {
            "success": False,
            "error": "HUGGINGFACE_API_KEY is not set",
            "api_key_status": "missing"
        }
    
    try:
        # Test the API key by making a request to the models endpoint
        headers = {
            "Authorization": f"Bearer {HUGGINGFACE_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # First test the models endpoint
        models_url = "https://huggingface.co/api/models"
        print(f"Testing models endpoint: {models_url}")
        models_response = requests.get(models_url, headers=headers)
        print(f"Models endpoint response status: {models_response.status_code}")
        print(f"Models response text: {models_response.text[:200]}...")  # Print first 200 chars
        
        # Then test the specific model endpoint
        model_url = f"https://huggingface.co/api/models/{MODEL_NAME}"
        print(f"Testing model endpoint: {model_url}")
        model_response = requests.get(model_url, headers=headers)
        print(f"Model endpoint response status: {model_response.status_code}")
        print(f"Model response text: {model_response.text[:200]}...")  # Print first 200 chars
        
        return {
            "success": True,
            "api_key_status": "present",
            "models_endpoint": {
                "status_code": models_response.status_code,
                "response": models_response.text[:200] + "..." if len(models_response.text) > 200 else models_response.text
            },
            "model_endpoint": {
                "status_code": model_response.status_code,
                "response": model_response.text[:200] + "..." if len(model_response.text) > 200 else model_response.text
            }
        }
        
    except requests.exceptions.RequestException as e:
        print(f"Error making request to Hugging Face API: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "api_key_status": "present"
        }
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "api_key_status": "present"
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