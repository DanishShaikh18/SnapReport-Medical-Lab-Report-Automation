# SnapReport

A small tool that photographs a lab machine screen or printed report, extracts all test readings using Gemini, lets the nurse fill in patient details, and generates a clean printable PDF report.

Built to reduce the manual transcription step that happens in most Indian diagnostic labs — nurse reads machine → writes on paper → types into computer → generates report. This skips the middle two.

---

## How it works

1. Upload a photo of the machine screen or existing report
2. Gemini 2.0 Flash reads all test names, values, units, and reference ranges
3. Low-confidence values get flagged for nurse review
4. Nurse fills in patient name, age, gender, doctor, date
5. Report renders and prints — browser handles PDF via Ctrl+P

No backend. No database. No build step. Runs entirely in the browser.

---

## Stack

| Part | What |
|---|---|
| Vision / OCR | Gemini 2.0 Flash (via Google AI Studio API) |
| Frontend | Plain HTML + vanilla JS (ES modules) |
| PDF | Browser print dialog |
| Templates | JSON files — one per hospital |

---

## Setup

You need a free Gemini API key from [aistudio.google.com](https://aistudio.google.com/app/apikey).

Clone and serve locally — a server is required because ES modules don't work over `file://`.

```bash
git clone https://github.com/yourname/snapreport
cd snapreport
python -m http.server 8000
# open http://localhost:8000
```

Enter your API key in the settings (⚙ icon in header). It's stored in `sessionStorage` — never sent anywhere except directly to Google's API.

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
