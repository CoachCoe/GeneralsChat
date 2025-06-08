# School Discipline Chatbot Backend
# Run this with: python app.py

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import os
import logging
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Get environment variables
API_KEY = os.getenv("HUGGINGFACE_API_KEY")
# Use a model known to work with free inference
MODEL_NAME = "EleutherAI/pythia-70m"  # os.getenv("MODEL_NAME", "EleutherAI/pythia-70m")
logger.info(f"Using model: {MODEL_NAME}")
PORT = int(os.getenv("PORT", "8000"))

# Log configuration on startup
logger.info(f"Starting with model: {MODEL_NAME}")
logger.info(f"API key is {'set' if API_KEY else 'not set'}")

app = FastAPI(title="School Discipline Chatbot API")

# Enable CORS
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

class ChatRequest(BaseModel):
    message: str

@app.get("/")
async def root():
    return {"message": "School Discipline Chatbot API"}

@app.get("/health")
async def health_check():
    """Check if the server and Hugging Face API are accessible"""
    try:
        if not API_KEY:
            logger.error("API key not set")
            return {"status": "unhealthy", "huggingface": "api_key_missing"}
            
        # Test Hugging Face API connection
        headers = {"Authorization": f"Bearer {API_KEY}"}
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
    """Chat endpoint that uses Hugging Face API for text generation"""
    try:
        if not request.message:
            return {"error": "No message provided"}
            
        if not API_KEY:
            logger.error("API key not set")
            return {"error": "API key not configured"}
            
        headers = {
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        }
        
        # Format the prompt for conversation
        prompt = f"""You are a helpful AI assistant for school administrators. 
You help with discipline issues and provide guidance based on school policies.
Please respond to the following question: {request.message}"""
        
        # Make the API call
        response = requests.post(
            f"https://api-inference.huggingface.co/models/{MODEL_NAME}",
            headers=headers,
            json={
                "inputs": prompt,
                "parameters": {
                    "max_length": 150,
                    "min_length": 10,
                    "temperature": 0.7,
                    "top_p": 0.95,
                    "do_sample": True,
                    "return_full_text": False
                }
            },
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            if isinstance(result, list) and len(result) > 0:
                return {"response": result[0].get("generated_text", "No response generated")}
            return {"response": "No response generated"}
        else:
            logger.error(f"API error: {response.status_code} - {response.text}")
            return {"error": f"API error: {response.status_code}"}
            
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        return {"error": str(e)}

@app.get("/test-huggingface")
async def test_huggingface():
    """Test endpoint to verify Hugging Face API connection and model access"""
    try:
        if not API_KEY:
            logger.error("API key not set")
            return {"status": "error", "message": "API key not configured"}

        headers = {
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        }

        # Test with the configured model
        test_model = MODEL_NAME
        logger.info(f"Testing with model: {test_model}")
        
        # First, check if we can access the model info
        model_info_url = f"https://huggingface.co/api/models/{test_model}"
        logger.info(f"Checking model info at: {model_info_url}")
        
        model_response = requests.get(model_info_url, headers=headers, timeout=5)
        logger.info(f"Model info response status: {model_response.status_code}")
        logger.info(f"Model info response: {model_response.text[:200]}")
        
        # Try direct model inference
        inference_url = f"https://api-inference.huggingface.co/models/{test_model}"
        logger.info(f"Testing inference at: {inference_url}")
        
        # Format input for conversation
        input_text = "You are a helpful AI assistant. Please respond to: Hello, how are you?"
        
        # Log the full request details
        request_data = {
            "inputs": input_text,
            "parameters": {
                "max_new_tokens": 100,
                "temperature": 0.7,
                "top_p": 0.95,
                "do_sample": True,
                "return_full_text": False,
                "repetition_penalty": 1.2
            }
        }
        logger.info(f"Request data: {request_data}")
        logger.info(f"Request headers: {headers}")
        
        response = requests.post(
            inference_url,
            headers=headers,
            json=request_data,
            timeout=30
        )
        
        # Log the full response details
        logger.info(f"Response status: {response.status_code}")
        logger.info(f"Response headers: {dict(response.headers)}")
        logger.info(f"Response text: {response.text}")
        
        return {
            "status": "test_complete",
            "api_key_status": "set" if API_KEY else "not_set",
            "api_key_length": len(API_KEY) if API_KEY else 0,
            "model_name": test_model,
            "model_info": {
                "url": model_info_url,
                "status_code": model_response.status_code,
                "response": model_response.text[:200] if model_response.status_code == 200 else model_response.text
            },
            "inference_test": {
                "url": inference_url,
                "status_code": response.status_code,
                "response": response.text[:200] if response.status_code == 200 else response.text,
                "input": input_text,
                "request_data": request_data
            }
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