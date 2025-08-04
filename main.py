# main.py
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import os
import openai
from dotenv import load_dotenv
from fastapi.staticfiles import StaticFiles

# These are for our text cleaning function
import re
import contractions

# Load environment variables
load_dotenv() 

try:
    client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    print("OpenAI client initialized successfully.")
except openai.OpenAIError as e:
    print(f"Error: Could not initialize OpenAI client. Is OPENAI_API_KEY set? Details: {e}")
    client = None

# The list of instructions
instructions = [
    "Let’s keep moving",
    "We’re almost there",
    "Stay low and follow me",
    "I can hear them coming",
    "Don’t look back",
    "The camp should be ahead",
    "It’s too quiet",
    "We have to find shelter",
    "I hope this ends",
    "Keep going"
]

# --- FastAPI App Setup ---
app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

# Pydantic model for type-safe request body
class GuessRequest(BaseModel):
    userGuess: str
    currentIndex: int

# HELPER FUNCTION FOR TEXT NORMALIZATION
def normalize_text(text: str) -> str:
    text = contractions.fix(text)
    text = text.lower()
    text = re.sub(r'[^\w\s]', '', text)
    return text.strip()

@app.get("/")
async def read_root():
    return FileResponse('static/index.html')

# NEW, SIMPLIFIED ENDPOINT FOR TEXT-BASED GUESSES
@app.post("/check-text-guess")
async def check_text_guess(guess_request: GuessRequest):
    if not client:
        return JSONResponse(content={"error": "OpenAI client not configured."}, status_code=500)

    try:
        # Get data from the Pydantic model
        user_transcript = guess_request.userGuess
        current_index = guess_request.currentIndex
        
        # Normalize both texts for a fair comparison
        expected_instruction = instructions[current_index]
        normalized_user_text = normalize_text(user_transcript)
        normalized_expected_text = normalize_text(expected_instruction)
        
        print(f"User (clean): '{normalized_user_text}'")
        print(f"Expected (clean): '{normalized_expected_text}'")

        # Use a Chat Model for the final comparison
        system_prompt = "You are a precise language comparison assistant. Your response must be a JSON object with a single boolean key: 'match'."

        user_prompt = (
            f"Compare the following two sentences strictly:\n"
            f"Sentence A (expected): \"{normalized_expected_text}\"\n"
            f"Sentence B (spoken): \"{normalized_user_text}\"\n\n"
            "Rules:\n"
            "1. Return {\"match\": true} ONLY if Sentence B contains ALL the key words and phrases from Sentence A, in the same relative order.\n"
            "2. The comparison must be case-insensitive.\n"
            "3. Ignore the following minor differences:\n"
            "   - Punctuation (e.g., commas, periods, apostrophes)\n"
            "   - Articles ('a' vs 'the')\n"
            "   - Filler words ('um', 'uh', etc.)\n"
            "   - Contractions and expansions (e.g., 'we’re' = 'we are', 'don’t' = 'do not', 'you’ll' = 'you will')\n"
            "4. Do NOT allow:\n"
            "   - Missing or substituted key words\n"
            "   - Rearranged word order\n"
            "   - Synonyms or paraphrased content\n"
            "   Examples:\n"
            "   - 'stay low' ≠ 'get low'\n"
            "   - 'stay low and follow me' ≠ 'follow me and stay low'\n"
            "5. Respond ONLY with one JSON object: {\"match\": true} or {\"match\": false}. Do not include any explanation."
        )

        chat_response = client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={ "type": "json_object" },
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        )
        
        import json
        match_result = json.loads(chat_response.choices[0].message.content)
        is_match = match_result.get("match", False)
        
        print(f"Chat Model decided: {is_match}")
        
        return JSONResponse(content={"is_match": is_match})

    except openai.OpenAIError as e:
        print(f"An error occurred with the OpenAI API: {e}")
        return JSONResponse(content={"error": "Failed to communicate with OpenAI"}, status_code=503)
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return JSONResponse(content={"error": "An internal server error occurred."}, status_code=500)