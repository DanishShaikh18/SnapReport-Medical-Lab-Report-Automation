import { GoogleGenAI } from "https://esm.run/@google/genai";

let aiClient = null;
let _usedFallback = false;

/**
 * Check if the last extraction used the Tesseract fallback.
 * app.js can call this after extractReadings() to show a banner.
 */
export function didUseFallback() {
    return _usedFallback;
}

/**
 * Initialize Gemini client with API key.
 * Call this once when the nurse enters their key.
 */
export function initGemini(apiKey) {
    aiClient = new GoogleGenAI({ apiKey });
}

// ─── Friendly error mapper ───────────────────────────────────────────────────
function friendlyError(err) {
    const msg = (err?.message || err?.toString() || "").toLowerCase();
    const status = err?.status || err?.httpStatusCode || 0;

    if (status === 401 || msg.includes("401") || msg.includes("api key not valid") || msg.includes("invalid api key"))
        return "Invalid API key. Check your key in Settings ⚙";
    if (status === 429 || msg.includes("429") || msg.includes("resource has been exhausted") || msg.includes("too many requests"))
        return "Too many requests. Wait 30 seconds and try again.";
    if (status === 403 || msg.includes("403") || msg.includes("permission denied") || msg.includes("access denied"))
        return "API access denied. Make sure Gemini API is enabled in your project.";
    if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network") || msg.includes("err_internet"))
        return "No internet connection. Check your network.";
    return null; // unknown — will trigger fallback
}

// ─── Tesseract fallback ──────────────────────────────────────────────────────
let tesseractLoaded = false;

async function loadTesseract() {
    if (tesseractLoaded) return;
    await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://unpkg.com/tesseract.js@5/dist/tesseract.min.js";
        script.onload = () => { tesseractLoaded = true; resolve(); };
        script.onerror = () => reject(new Error("Failed to load Tesseract.js"));
        document.head.appendChild(script);
    });
}

/**
 * Run Tesseract OCR on a base64 image and parse the raw text into
 * the same JSON shape that Gemini returns.
 */
async function tesseractFallback(imageBase64, mimeType) {
    await loadTesseract();

    const dataUrl = `data:${mimeType};base64,${imageBase64}`;
    const { data } = await Tesseract.recognize(dataUrl, "eng", {
        logger: () => {},  // silence progress logs
    });

    return parseOcrText(data.text);
}

/**
 * Best-effort parser: turns raw OCR text lines into structured tests[].
 * Confidence for every Tesseract result is fixed at 0.6 so the nurse
 * is prompted to review every single value.
 */
function parseOcrText(raw) {
    const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
    const tests = [];

    // Regex: tries to capture  Name ... Value Unit RefLo-RefHi
    const testRe = /^(.+?)\s+([\d.]+)\s*([a-zA-Z%/μµ³²·×x]+(?:\/[a-zA-Z%μµ³²·×x]+)?)\s+([\d.]+-[\d.]+)?\s*$/;
    // Section-like lines: all caps, no digits, short
    const sectionRe = /^[A-Z\s:()]{4,}$/;

    for (const line of lines) {
        const m = line.match(testRe);
        if (m) {
            tests.push({
                section: "",
                name: m[1].trim(),
                method: "",
                value: m[2],
                unit: m[3],
                reference_range: m[4] || "",
                confidence: 0.6,
            });
        } else if (sectionRe.test(line) && line.length < 60) {
            tests.push({
                section: line,
                name: "",
                method: "",
                value: "",
                unit: "",
                reference_range: "",
                confidence: 0.6,
            });
        }
    }

    return {
        lab_name: "",
        certificate_no: "",
        tests,
    };
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Extract all test readings from a lab report or machine screen image.
 * Returns structured JSON ready to populate the verification table.
 *
 * If Gemini fails for any reason, automatically falls back to Tesseract.js
 * browser OCR. The caller can check didUseFallback() afterward.
 *
 * @param {string} imageBase64  - Base64 image data (no data:image/... prefix)
 * @param {string} mimeType     - e.g. 'image/jpeg', 'image/png'
 * @returns {Promise<Object>}
 */
export async function extractReadings(imageBase64, mimeType) {
    _usedFallback = false;

    // ── Try Gemini first ─────────────────────────────────────────────────
    if (aiClient) {
        try {
            const prompt = `You are a medical lab report OCR system. Analyze this image carefully.

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
- Return ONLY the JSON. No markdown, no explanation, no code fences.`;

            const response = await aiClient.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [
                    { text: prompt },
                    {
                        inlineData: {
                            data: imageBase64,
                            mimeType: mimeType,
                        },
                    },
                ],
                config: {
                    temperature: 0.1,
                    responseMimeType: "application/json",
                },
            });

            const raw = response.text.trim();

            try {
                return JSON.parse(raw);
            } catch {
                // Gemini occasionally wraps in fences — strip and retry
                const cleaned = raw
                    .replace(/^```json\s*/i, "")
                    .replace(/^```\s*/i, "")
                    .replace(/```\s*$/i, "")
                    .trim();
                try {
                    return JSON.parse(cleaned);
                } catch {
                    // JSON parse failed — fall through to Tesseract
                }
            }
        } catch (geminiErr) {
            // Check for hard errors that should NOT fallback (give user a clear message)
            const friendly = friendlyError(geminiErr);
            if (friendly) {
                throw new Error(friendly);
            }
            // Unknown Gemini error → fall through to Tesseract
            console.warn("Gemini failed, falling back to Tesseract:", geminiErr);
        }
    }

    // ── Fallback: Tesseract.js ───────────────────────────────────────────
    try {
        _usedFallback = true;
        return await tesseractFallback(imageBase64, mimeType);
    } catch (tessErr) {
        console.error("Tesseract fallback also failed:", tessErr);
        throw new Error("Could not read the image. Try a clearer photo.");
    }
}