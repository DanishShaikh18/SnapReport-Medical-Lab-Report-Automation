import { extractReadings, didUseFallback } from "./gemini.js";

// ─── State ────────────────────────────────────────────────────────────────────
let selectedFile = null;
let extractedData = null;   // raw response from gemini.js
let activeTemplate = null;  // loaded from templates/*.json

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    loadTemplate("templates/default.json");
    setupUploadZone();
});



// ─── Template loader ──────────────────────────────────────────────────────────
async function loadTemplate(path) {
    try {
        const res = await fetch(path);
        activeTemplate = await res.json();
    } catch {
        // default fallback if file missing
        activeTemplate = {
            lab_name: "Laboratory",
            lab_subtitle: "Pathology Services",
            accent_color: "#C0392B",
            footer_text: "",
            signatory_name: "",
            signatory_title: "Pathologist",
        };
    }
}

// ─── Upload zone ──────────────────────────────────────────────────────────────
function setupUploadZone() {
    const zone = document.getElementById("uploadZone");
    const input = document.getElementById("fileInput");

    input.addEventListener("change", () => handleFile(input.files[0]));

    zone.addEventListener("dragover", (e) => {
        e.preventDefault();
        zone.classList.add("drag");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
    zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("drag");
        const file = e.dataTransfer.files[0];
        if (file?.type.startsWith("image/")) handleFile(file);
    });
}

function handleFile(file) {
    if (!file) return;
    selectedFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById("previewImg").src = e.target.result;
        document.getElementById("uploadZone").style.display = "none";
        document.getElementById("uploadPreview").style.display = "block";
    };
    reader.readAsDataURL(file);
}

// Called by "Change image" button in HTML
window.resetUpload = function () {
    selectedFile = null;
    document.getElementById("fileInput").value = "";
    document.getElementById("uploadZone").style.display = "block";
    document.getElementById("uploadPreview").style.display = "none";
};

// ─── Step navigation ──────────────────────────────────────────────────────────
window.goToStep = function (n) {
    document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
    document.getElementById("step" + n).classList.add("active");

    document.querySelectorAll(".step-bar").forEach((el, i) => {
        el.classList.remove("active", "done");
        if (i + 1 < n) el.classList.add("done");
        else if (i + 1 === n) el.classList.add("active");
    });
};

window.goBack = () => goToStep(1);

// ─── Error banner ─────────────────────────────────────────────────────────────
function showErrorBanner(msg, type = "red") {
    const cls = type === "amber" ? "alert-amber" : "alert-red";
    const icon = type === "amber" ? "⚠" : "✗";
    document.getElementById("loadingState").innerHTML = `
        <div class="alert ${cls}" style="text-align:left; max-width:480px; margin:48px auto;">
            <div style="font-weight:600; margin-bottom:6px;">${icon} Extraction failed</div>
            <div>${esc(msg)}</div>
        </div>
        <button class="btn btn-outline" onclick="goBack()">← Try again</button>`;
    document.getElementById("loadingState").style.display = "block";
}

// ─── Extraction ───────────────────────────────────────────────────────────────
window.startExtraction = async function () {
    if (!selectedFile) return showToast("Please upload an image first.");
    goToStep(2);
    setLoading(true);

    try {
        const base64 = await fileToBase64(selectedFile);
        const mimeType = selectedFile.type || "image/jpeg";
        extractedData = await extractReadings(base64, mimeType);

        // Check if fallback was used
        if (didUseFallback()) {
            renderVerification(extractedData, true);
        } else {
            renderVerification(extractedData, false);
        }
    } catch (err) {
        setLoading(false);
        showErrorBanner(err.message);
    }
};

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function setLoading(show) {
    document.getElementById("loadingState").style.display = show ? "block" : "none";
    document.getElementById("verifyContent").style.display = show ? "none" : "block";
}

// ─── Toast notification ──────────────────────────────────────────────────────
function showToast(msg) {
    // Remove existing toast if any
    const existing = document.getElementById("toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    toast.textContent = msg;
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ─── Verification table ───────────────────────────────────────────────────────
function renderVerification(data, usedFallback = false) {
    setLoading(false);

    const tests = data.tests || [];
    let lowConf = 0;
    let abnormal = 0;
    let rows = "";

    tests.forEach((t, i) => {
        // Section header row
        if (t.section) {
            rows += `<tr class="section-row"><td colspan="6">${esc(t.section)}</td></tr>`;
            return;
        }

        const conf = parseFloat(t.confidence) ?? 0.9;
        const status = getRangeStatus(t.value, t.reference_range);
        if (conf < 0.85) lowConf++;
        if (status !== "normal") abnormal++;

        const inputCls = [
            "value-input",
            conf < 0.85 ? "low-conf" : "",
            status !== "normal" ? "abnormal" : "",
        ].filter(Boolean).join(" ");

        rows += `
        <tr>
            <td>
                <div class="test-name">${esc(t.name)}</div>
                ${t.method ? `<div class="test-method">${esc(t.method)}</div>` : ""}
            </td>
            <td>
                <input class="${inputCls}"
                       id="val_${i}"
                       value="${esc(t.value)}"
                       oninput="onValueEdit(this, ${i})">
            </td>
            <td class="muted">${esc(t.unit)}</td>
            <td class="muted">${esc(t.reference_range)}</td>
            <td id="status_${i}">${statusBadge(status)}</td>
            <td>${confBadge(conf)}</td>
        </tr>`;
    });

    document.getElementById("resultsBody").innerHTML = rows;

    // Summary line
    const parts = [`${tests.filter((t) => !t.section).length} readings extracted`];
    if (lowConf) parts.push(`<span class="warn">${lowConf} need review</span>`);
    if (abnormal) parts.push(`<span class="danger">${abnormal} outside range</span>`);
    document.getElementById("confSummary").innerHTML = parts.join(" · ");

    // Alert banners
    let alerts = "";
    if (usedFallback) {
        alerts += `<div class="alert alert-amber">⚠ Gemini unavailable — fallback OCR used. Please review all values carefully.</div>`;
    }
    if (lowConf) alerts += `<div class="alert alert-amber">⚠ ${lowConf} value(s) flagged low confidence — highlighted in amber. Please verify before generating.</div>`;
    if (abnormal) alerts += `<div class="alert alert-red">🔴 ${abnormal} value(s) outside reference range — will be marked in the report.</div>`;
    document.getElementById("alertBanner").innerHTML = alerts;
}

// Live edit: update status badge when nurse corrects a value
window.onValueEdit = function (input, idx) {
    const t = extractedData.tests.filter((x) => !x.section)[idx];
    if (!t) return;
    t.value = input.value;
    const status = getRangeStatus(input.value, t.reference_range);
    document.getElementById("status_" + idx).innerHTML = statusBadge(status);
    input.className = ["value-input", status !== "normal" ? "abnormal" : ""].filter(Boolean).join(" ");
};

// ─── Report generation ────────────────────────────────────────────────────────
window.generateReport = function () {
    if (!extractedData) return;

    // Pull edited values back into extractedData
    let testIdx = 0;
    extractedData.tests.forEach((t) => {
        if (t.section) return;
        const el = document.getElementById("val_" + testIdx++);
        if (el) t.value = el.value;
    });

    // Collect patient details the nurse filled in
    const patient = {
        name:   document.getElementById("p_name")?.value.trim() || "",
        age:    document.getElementById("p_age")?.value.trim() || "",
        gender: document.getElementById("p_gender")?.value.trim() || "",
        date:   document.getElementById("p_date")?.value.trim() || "",
        doctor: document.getElementById("p_doctor")?.value.trim() || "",
        sample: document.getElementById("p_sample")?.value.trim() || "",
    };

    goToStep(3);
    renderReport(extractedData, patient, activeTemplate);
};

// ─── Report renderer ──────────────────────────────────────────────────────────
function renderReport(data, patient, tmpl) {
    const accentColor = tmpl.accent_color || "#C0392B";

    let testRows = "";
    (data.tests || []).forEach((t) => {
        if (t.section) {
            testRows += `<tr class="rpt-group-header"><td colspan="4">${esc(t.section)}</td></tr>`;
            return;
        }
        const status = getRangeStatus(t.value, t.reference_range);
        const abnCls = status !== "normal" ? "rpt-abnormal" : "";
        const flag = status === "high" ? " ↑" : status === "low" ? " ↓" : "";

        testRows += `
        <tr>
            <td>
                <strong>${esc(t.name)}</strong>
                ${t.method ? `<span class="rpt-method">(Method: ${esc(t.method)})</span>` : ""}
            </td>
            <td class="rpt-val ${abnCls}">${esc(t.value)}${flag}</td>
            <td class="rpt-center">${esc(t.unit)}</td>
            <td class="rpt-center">${esc(t.reference_range)}</td>
        </tr>`;
    });

    document.getElementById("reportOutput").innerHTML = `
    <div class="rpt-header">
        <div>
            <div class="rpt-lab-name" style="color:${accentColor}">${esc(tmpl.lab_name)}</div>
            <div class="rpt-lab-sub">${esc(tmpl.lab_subtitle || "")}</div>
        </div>
        <div class="rpt-right-info">
            <div>Date: ${esc(patient.date)}</div>
        </div>
    </div>

    <div class="rpt-title-bar" style="background:${accentColor}">LABORATORY REPORT</div>

    <div class="rpt-patient-grid">
        <div class="rpt-patient-row"><span class="rpt-label">Patient Name</span><span class="rpt-value">: ${esc(patient.name)}</span></div>
        <div class="rpt-patient-row"><span class="rpt-label">Age / Gender</span><span class="rpt-value">: ${esc(patient.age)} / ${esc(patient.gender)}</span></div>
        <div class="rpt-patient-row"><span class="rpt-label">Ref. Doctor</span><span class="rpt-value">: ${esc(patient.doctor)}</span></div>
        <div class="rpt-patient-row"><span class="rpt-label">Sample Type</span><span class="rpt-value">: ${esc(patient.sample)}</span></div>
        <div class="rpt-patient-row"><span class="rpt-label">Report Date</span><span class="rpt-value">: ${esc(patient.date)}</span></div>
    </div>

    <table class="rpt-table">
        <thead>
            <tr>
                <th style="width:45%">TEST DESCRIPTION</th>
                <th style="width:15%;text-align:right">RESULT</th>
                <th style="width:15%;text-align:center">UNITS</th>
                <th style="width:25%;text-align:center">REFERENCE RANGE</th>
            </tr>
        </thead>
        <tbody>${testRows}</tbody>
    </table>

    <div class="rpt-footer">
        <div class="rpt-footer-note">${esc(tmpl.footer_text || "")}</div>
        <div class="rpt-sign">
            <div class="rpt-sign-name">${esc(tmpl.signatory_name || "")}</div>
            <div class="rpt-sign-title">${esc(tmpl.signatory_title || "")}</div>
        </div>
    </div>
    <div class="rpt-page-num">Page 1 of 1</div>`;
}

// ─── Print ────────────────────────────────────────────────────────────────────
window.printReport = function () {
    window.print();
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getRangeStatus(value, range) {
    const v = parseFloat(value);
    if (isNaN(v) || !range) return "normal";
    const parts = range.replace(/\s/g, "").split("-");
    if (parts.length < 2) return "normal";
    const lo = parseFloat(parts[0]);
    const hi = parseFloat(parts[1]);
    if (isNaN(lo) || isNaN(hi)) return "normal";
    if (v < lo) return "low";
    if (v > hi) return "high";
    return "normal";
}

function statusBadge(status) {
    const map = {
        normal: `<span class="badge badge-normal">Normal</span>`,
        high:   `<span class="badge badge-high">High ↑</span>`,
        low:    `<span class="badge badge-low">Low ↓</span>`,
    };
    return map[status] || map.normal;
}

function confBadge(conf) {
    const pct = Math.round(conf * 100);
    if (conf >= 0.85) return `<span class="badge badge-conf-ok">${pct}%</span>`;
    if (conf >= 0.6)  return `<span class="badge badge-conf-warn">${pct}% ⚠</span>`;
    return `<span class="badge badge-conf-err">${pct}% ✗</span>`;
}

function esc(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
