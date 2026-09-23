# SnapReport: Medical Lab Report Automation

## 1. What is this project?
**SnapReport** is a lightweight, browser-based tool designed to automate and streamline the transcription process in medical diagnostic labs. In many labs, nurses manually read test results from a machine screen, write them on paper, and then type them into a computer to generate a report. SnapReport eliminates the middle steps by taking a photo of the machine screen or printed report, automatically extracting the test readings using AI, and allowing the nurse to instantly generate a clean, printable PDF report after a quick review. 

It is designed to be highly accessible with **no backend, no database, and no complex build steps**—it runs entirely in the browser.

---

## 2. How it works
1. **Image Upload:** The user (e.g., a nurse) uploads a photo of a lab machine screen or an existing printed report into the browser.
2. **AI Extraction:** The image is sent to **Gemini 2.5 Flash**, which acts as a Vision-Language OCR model. It extracts all visible test names, values, units, and reference ranges into a structured JSON format.
3. **Verification & Human-in-the-Loop:** 
   - The extracted data is displayed in a review table.
   - Values with low AI confidence (< 85%) are flagged in amber.
   - Values outside the normal reference range are flagged in red.
   - If the Gemini API fails, it automatically falls back to **Tesseract.js** (a local browser OCR) and flags all values for manual review.
4. **Data Entry:** The nurse reviews/corrects the data and fills in patient details (Name, Age, Gender, Ref. Doctor, Date).
5. **Report Generation:** The tool merges the extracted data, patient details, and a predefined lab template (JSON format) to render a professional report.

---

## 3. How it runs and gives outputs
- **Running:** Since it uses JavaScript ES Modules, it cannot be run directly via the `file://` protocol. It is served locally using a simple HTTP server (e.g., `python -m http.server 8000`).
- **Configuration:** It requires a free Google Gemini API key, which the user enters into the UI settings. This key is stored securely in the browser's `sessionStorage`.
- **Output:** The output is a cleanly styled HTML page optimized for printing using `@media print` CSS rules. The user clicks "Print / Save PDF", and the browser's native print dialog handles generating the final PDF report.

---

## 4. Tech Stack
| Component | Technology Used |
| :--- | :--- |
| **Frontend UI** | Vanilla HTML5, CSS3, JavaScript (ES Modules) |
| **Primary AI / Vision OCR** | Google Gemini 2.5 Flash (via `@google/genai` SDK) |
| **Fallback OCR** | Tesseract.js (loaded via CDN) |
| **Templating** | JSON files (for customizing lab names, colors, footers) |
| **Deployment / Server** | None required (Static files, local HTTP server for dev) |

---

## 5. AI Engineering Skills Used
This project demonstrates several core **AI Engineering** principles:

* **Prompt Engineering for Structured Outputs:** The project uses highly specific, zero-shot prompting to force the LLM to return data in a strict JSON schema, instructing it exactly how to handle missing values, formatting, and section headers.
* **Vision-Language Model (VLM) Integration:** Effectively utilizing multimodal models (Gemini Flash) to parse complex spatial and tabular data from raw images, a task traditional OCR struggles with.
* **Human-in-the-Loop (HITL) Design:** The AI doesn't just automate; it calculates confidence scores. Low-confidence extractions are intentionally flagged to require human review, balancing automation with medical safety.
* **Graceful Degradation & Fallbacks:** Implementing error handling that seamlessly switches from a cloud-based LLM (Gemini) to a local, traditional OCR engine (Tesseract.js) if API limits are hit or the network fails.
* **Edge/Client-Side AI Execution:** Handling the orchestration of AI calls entirely on the client side without needing an intermediate proxy server.

---

## 6. Workflow Diagram

```text
+-------------------+       +-----------------------+       +------------------------+
|                   |       |                       |       |                        |
| 1. Upload Image   +------>+ 2. AI Extraction      +------>+ 3. Human Verification  |
| (Machine Screen / |       | (Gemini 2.5 Flash)    |       | (Review Table & Flags) |
| Printed Report)   |       |                       |       |                        |
+-------------------+       +-----------+-----------+       +-----------+------------+
                                        |                               |
                                  [API Fails?]                          |
                                        |                               |
                                        v                               v
                            +-----------+-----------+       +-----------+------------+
                            |                       |       |                        |
                            | 2b. Fallback OCR      +------>+ 4. Patient Data Entry  |
                            | (Tesseract.js)        |       | (Name, Age, Doctor)    |
                            |                       |       |                        |
                            +-----------------------+       +-----------+------------+
                                                                        |
                                                                        v
                                                            +-----------+------------+
                                                            |                        |
                                                            | 5. Template Merging &  |
                                                            | Report Generation      |
                                                            |                        |
                                                            +-----------+------------+
                                                                        |
                                                                        v
                                                            +-----------+------------+
                                                            |                        |
                                                            | 6. Final Output        |
                                                            | (Browser Print / PDF)  |
                                                            |                        |
                                                            +------------------------+
```
