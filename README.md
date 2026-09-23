# SnapReport

A small tool that photographs a lab machine screen or printed report, extracts all test readings using Gemini, lets the nurse fill in patient details, and generates a clean printable PDF report.

Built to reduce the manual transcription step that happens in most Indian diagnostic labs — nurse reads machine → writes on paper → types into computer → generates report. This skips the middle two.

---

## How it works

1. Upload a photo of the machine screen or existing report
2. Gemini 3.5 Flash reads all test names, values, units, and reference ranges
3. Low-confidence values get flagged for nurse review
4. Nurse fills in patient name, age, gender, doctor, date
5. Report renders and prints — browser handles PDF via Ctrl+P

No database. No complex build steps. Uses a lightweight Python backend for secure AI API access.

---

## AI Stack & Tech Stack

| Part | Technology Used |
|---|---|
| **AI / Vision OCR** | **Google Gemini 3.5 Flash** (via `google-genai` SDK on Vertex AI) |
| **Fallback OCR** | **Tesseract.js** (local browser fallback) |
| **Backend** | **Python (FastAPI)** |
| **Frontend** | **Plain HTML + Vanilla JS** (ES modules) |
| **Templating** | **JSON files** |
| **Authentication** | **GCP Application Default Credentials (ADC)** |

---

## AI Engineering Skills Showcased

This project was built demonstrating several core AI Engineering practices:
- **Prompt Engineering for Structured Outputs:** Forcing a Vision-Language Model (VLM) to parse messy spatial data and strictly adhere to a complex JSON schema without hallucinating fields.
- **Human-in-the-Loop (HITL) Design:** AI extractions are assigned confidence scores. Anything below 85% is flagged in the UI for mandatory human review to ensure medical safety.
- **Graceful AI Degradation:** If the cloud-based AI API fails or rate limits, the system seamlessly falls back to a local, traditional OCR model (Tesseract.js).
- **Secure AI Architecture:** Abstracting the LLM calls into a FastAPI backend to utilize Application Default Credentials (ADC), keeping credentials completely out of the frontend.

---

## Setup

This project uses Google Cloud Vertex AI via Application Default Credentials (ADC). No manual API keys are required.

Clone, setup the virtual environment, and run the backend server:

```bash
git clone https://github.com/yourname/snapreport
cd snapreport

# Authenticate with Google Cloud
gcloud auth application-default login

# Setup Python environment
python -m venv venv
.\venv\Scripts\activate  # Windows
# source venv/bin/activate # Mac/Linux
pip install -r requirements.txt

# Run the backend and frontend server
uvicorn main:app --reload --port 8000
# open http://localhost:8000
```

---

## Adding a hospital template

Copy `templates/default.json`, fill in the lab name, colors, signatory, footer. Drop it in `/templates`. Point `loadTemplate()` in `app.js` to the new file.

```json
{
  "lab_name": "Your Lab Name",
  "lab_subtitle": "Your subtitle",
  "accent_color": "#C0392B",
  "footer_text": "Tests performed at Your Lab — NABL Accredited",
  "signatory_name": "Dr. Name",
  "signatory_title": "DNB (Pathology)"
}
```

---

## Limitations

- Accuracy depends on image quality — blurry or glare-heavy photos will have low confidence flags
- Fallback OCR (Tesseract) is rough — it needs nurse review on every field
- No report history or patient records — by design, keep it simple for now
- Tested primarily on Indian diagnostic lab report formats

---

## Status

Early working prototype. The core flow works. Template system works. Error handling and mobile polish are in progress.
