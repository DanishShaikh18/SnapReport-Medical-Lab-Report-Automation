import os
import json
import base64
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from google import genai
from google.genai import types

app = FastAPI()

# Setup GenAI client for Vertex AI using Application Default Credentials
try:
    client = genai.Client(
        enterprise=True,
        project="project-garden-505118",
        location="global",
    )
except Exception as e:
    print(f"Warning: Failed to initialize GenAI client: {e}")
    client = None

class ExtractRequest(BaseModel):
    image_base64: str
    mime_type: str

@app.post("/api/extract")
def extract_readings(request: ExtractRequest):
    if not client:
        raise HTTPException(status_code=500, detail="GenAI client not initialized (check GCP credentials)")

    prompt = """You are a medical lab report OCR system. Analyze this image carefully.

Extract every test reading visible. Return ONLY a JSON object in exactly this shape:

{
  "lab_name": "name of the lab or hospital if visible, else empty string",
  "certificate_no": "certificate or report number if visible, else empty string",
  "tests": [
    {
      "section": "section heading (e.g. Hematology, Differential Leukocyte Counts). Use this when the row is a group header, not a test. Leave empty string for actual tests.",
      "name": "full test name exactly as shown",
      "method": "method or analyzer info shown below the test name, else empty string",
      "value": "the numeric result as a string, exactly as shown (e.g. '6.1', '00', '5.11')",
      "unit": "unit exactly as shown (e.g. 'x1000/μL', 'g/dL', '%')",
      "reference_range": "reference range exactly as shown (e.g. '4-10', '13.0-17.0', '150-450')",
      "confidence": 0.95
    }
  ]
}

Rules:
- confidence is 0.0 to 1.0. Use < 0.85 when the value is unclear, blurry, or ambiguous.
- For section/group header rows (no numeric value), set "section" to the heading text and leave name, value, unit, reference_range as empty strings.
- For actual test rows, leave "section" as empty string.
- Include ALL tests, even those with value "00" or "0".
- Preserve units exactly — do not convert or simplify.
- Do not infer or guess values. If a value is unreadable, set value to "" and confidence to 0.0.
- Return ONLY the JSON. No markdown, no explanation, no code fences."""

    try:
        image_bytes = base64.b64decode(request.image_base64)
        
        response = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=[
                prompt,
                types.Part.from_bytes(
                    data=image_bytes,
                    mime_type=request.mime_type,
                )
            ],
            config=types.GenerateContentConfig(
                temperature=0.1,
                response_mime_type="application/json"
            )
        )
        
        raw = response.text.strip()
        
        # Clean up in case Gemini wraps in markdown fences
        if raw.startswith("```json"):
            raw = raw[7:]
        if raw.startswith("```"):
            raw = raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()
            
        return json.loads(raw)
    
    except Exception as e:
        print(f"Error during extraction: {e}")
        raise HTTPException(status_code=500, detail=f"Extraction Error: {str(e)}")

# Mount static files (serve current directory)
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
