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
MODEL_NAME = os.getenv("MODEL_NAME", "facebook/opt-350m")
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
    """Chat endpoint that uses Hugging Face API"""
    try:
        if not API_KEY:
            logger.error("API key not set")
            raise HTTPException(status_code=500, detail="API key not configured")

        logger.info(f"Calling Hugging Face API with model: {MODEL_NAME}")

        # Prepare the request
        headers = {
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        }
        
        # Format the prompt
        prompt = f"""You are a helpful AI assistant for school administrators. 
        You help with discipline issues and provide guidance based on school policies.
        Please respond to the following question: {request.message}"""
        
        # Make the request
        inference_url = f"https://api-inference.huggingface.co/models/{MODEL_NAME}"
        logger.info(f"Making inference request to: {inference_url}")
        
        response = requests.post(
            inference_url,
            headers=headers,
            json={"inputs": prompt}
        )
        
        logger.info(f"Hugging Face API response status: {response.status_code}")
        logger.info(f"Response text: {response.text[:200]}...")
        
        if response.status_code == 200:
            try:
                response_data = response.json()
                if isinstance(response_data, list) and len(response_data) > 0:
                    generated_text = response_data[0].get('generated_text', '')
                    # Extract the response after the prompt
                    response_text = generated_text[len(prompt):].strip()
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

@app.get("/test-huggingface")
async def test_huggingface():
    """Test endpoint to verify Hugging Face API connection"""
    try:
        if not API_KEY:
            logger.error("API key not set")
            return {"status": "error", "message": "API key not configured"}

        headers = {
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        }

        # Test the model endpoint
        test_url = f"https://api-inference.huggingface.co/models/{MODEL_NAME}"
        logger.info(f"Testing URL: {test_url}")
        
        response = requests.post(
            test_url,
            headers=headers,
            json={"inputs": "Hello, how are you?"}
        )
        
        return {
            "status": "test_complete",
            "api_key_status": "set" if API_KEY else "not_set",
            "api_key_length": len(API_KEY) if API_KEY else 0,
            "model_name": MODEL_NAME,
            "test_url": test_url,
            "response_status": response.status_code,
            "response_text": response.text[:200] if response.status_code == 200 else response.text
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