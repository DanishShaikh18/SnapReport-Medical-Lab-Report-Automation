let _usedFallback = false;

/**
 * Check if the last extraction used the Tesseract fallback.
 * app.js can call this after extractReadings() to show a banner.
 */
export function didUseFallback() {
    return _usedFallback;
}

// ─── Friendly error mapper ───────────────────────────────────────────────────
function friendlyError(err) {
    const msg = (err?.message || err?.toString() || "").toLowerCase();
    const status = err?.status || err?.httpStatusCode || 0;

    if (status === 500 || msg.includes("500") || msg.includes("genai client not initialized"))
        return "Backend Gemini client not initialized. Check GCP credentials.";
    if (status === 429 || msg.includes("429") || msg.includes("resource has been exhausted") || msg.includes("too many requests"))
        return "Too many requests. Wait 30 seconds and try again.";
    if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network") || msg.includes("err_internet"))
        return "No internet connection or backend server is down. Check your network.";
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

    // ── Try Backend API first ─────────────────────────────────────────────────
    try {
        const response = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_base64: imageBase64,
                mime_type: mimeType
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || `Server error: ${response.status}`);
        }

        return await response.json();
    } catch (apiErr) {
        // Check for hard errors that should NOT fallback (give user a clear message)
        const friendly = friendlyError(apiErr);
        if (friendly) {
            throw new Error(friendly);
        }
        // Unknown error → fall through to Tesseract
        console.warn("Backend API failed, falling back to Tesseract:", apiErr);
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