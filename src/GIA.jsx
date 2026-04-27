import { useState, useRef, useCallback, useEffect } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxTsARSVGvJJhvdU1ffrybLLpOz_lp9Bcjtgc1oDk5eXKorANYs9sMj0BViOofYBXRnYg/exec";

const DESAS = [
  "Desa Pesisir Timur",
  "Desa Sri Tanjung",
  "Desa Tarempa Barat",
  "Desa Tarempa Barat Daya",
  "Desa Tarempa Selatan",
  "Desa Tarempa Timur",
  "Kelurahan Tarempa",
];

const JENIS_KEGIATAN = ["Jum'at Bersih", "Selasa Goro"];

const TEMPLATE = {
  penyusun: "YOPI PALINTINO, S.T.",
  pereviu: "DESTI WASTUTI, S.E., CDSP",
  penyetuju: "SUHEIMI, S.E., M.Si.",
};

// Global in-memory store: { [jenis+tanggal]: { [desa]: [dataURL, ...] } }
const globalPhotoStore = {};

function storeKey(jenis, tanggal) {
  return `${jenis}__${tanggal}`;
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function formatDate(iso) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  return `${d} ${months[+m - 1]} ${y}`;
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Lora:ital,wght@0,600;1,500&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --forest: #0d2818;
    --pine:   #1a3a2a;
    --moss:   #2d6a4f;
    --sage:   #52b788;
    --mist:   #b7e4c7;
    --foam:   #f0faf3;
    --gold:   #e9c46a;
    --amber:  #f4a261;
    --cream:  #fef9f0;
    --white:  #ffffff;
    --red:    #e63946;
    --gray:   #6c757d;
    --light:  #f8f9fa;
    --border: #dee2e6;
    --shadow-sm: 0 2px 8px rgba(13,40,24,0.08);
    --shadow-md: 0 4px 20px rgba(13,40,24,0.12);
    --shadow-lg: 0 8px 40px rgba(13,40,24,0.16);
  }

  body {
    font-family: 'Plus Jakarta Sans', sans-serif;
    background: var(--foam);
    color: var(--forest);
    min-height: 100dvh;
  }

  .msymbol {
    font-family: 'Material Symbols Outlined';
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
    font-size: 22px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    user-select: none;
  }
  .msymbol.filled { font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
  .msymbol.sm { font-size: 18px; }
  .msymbol.lg { font-size: 28px; }
  .msymbol.xl { font-size: 36px; }

  /* ── ROLE SELECTOR ─── */
  .role-bg {
    min-height: 100dvh;
    background:
      radial-gradient(ellipse 80% 60% at 20% 10%, rgba(45,106,79,0.35) 0%, transparent 55%),
      radial-gradient(ellipse 60% 80% at 85% 90%, rgba(82,183,136,0.2) 0%, transparent 50%),
      linear-gradient(145deg, var(--forest) 0%, var(--pine) 45%, var(--moss) 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    position: relative;
    overflow: hidden;
  }
  .role-bg::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px);
    background-size: 28px 28px;
  }
  .brand-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 100px;
    padding: 8px 20px;
    color: var(--mist);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin-bottom: 24px;
  }
  .role-title {
    font-family: 'Lora', serif;
    font-size: clamp(32px, 6vw, 52px);
    font-weight: 600;
    color: #fff;
    text-align: center;
    line-height: 1.1;
    margin-bottom: 12px;
  }
  .role-title em {
    font-style: italic;
    color: var(--gold);
  }
  .role-subtitle {
    color: rgba(255,255,255,0.6);
    font-size: 15px;
    text-align: center;
    max-width: 440px;
    line-height: 1.7;
    margin-bottom: 48px;
  }
  .role-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    width: 100%;
    max-width: 600px;
  }
  @media (max-width: 500px) {
    .role-cards { grid-template-columns: 1fr; }
  }
  .role-card {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 20px;
    padding: 28px 24px;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.34,1.56,0.64,1);
    display: flex;
    flex-direction: column;
    gap: 16px;
    position: relative;
    overflow: hidden;
  }
  .role-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 60%);
    opacity: 0;
    transition: opacity 0.2s;
  }
  .role-card:hover {
    transform: translateY(-6px) scale(1.02);
    border-color: rgba(255,255,255,0.35);
    background: rgba(255,255,255,0.14);
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  }
  .role-card:hover::before { opacity: 1; }
  .role-card:active { transform: scale(0.97); }
  .role-icon {
    width: 56px;
    height: 56px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .role-card-title {
    color: #fff;
    font-size: 18px;
    font-weight: 800;
    line-height: 1.2;
  }
  .role-card-desc {
    color: rgba(255,255,255,0.55);
    font-size: 13px;
    line-height: 1.6;
    flex: 1;
  }
  .role-arrow {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--gold);
    font-size: 13px;
    font-weight: 700;
  }
  .wa-link {
    margin-top: 48px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: rgba(255,255,255,0.4);
    font-size: 13px;
    text-decoration: none;
    transition: color 0.2s;
  }
  .wa-link:hover { color: rgba(255,255,255,0.8); }

  /* ── SHARED SHELL ─── */
  .app-shell {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--foam);
  }
  .topbar {
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--white);
    border-bottom: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    padding: 0 20px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .topbar-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 800;
    font-size: 15px;
    color: var(--pine);
  }
  .topbar-brand-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--sage);
  }
  .back-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--light);
    border: 1px solid var(--border);
    border-radius: 100px;
    padding: 6px 14px 6px 10px;
    font-size: 13px;
    font-weight: 600;
    color: var(--pine);
    cursor: pointer;
    transition: all 0.15s;
  }
  .back-btn:hover { background: var(--foam); border-color: var(--sage); }
  .role-pill {
    background: var(--foam);
    border: 1px solid var(--mist);
    border-radius: 100px;
    padding: 5px 14px;
    font-size: 12px;
    font-weight: 700;
    color: var(--moss);
  }
  .content-area {
    flex: 1;
    padding: 28px 20px 100px;
    max-width: 720px;
    margin: 0 auto;
    width: 100%;
  }

  /* ── PAGE HEADER ─── */
  .page-header {
    margin-bottom: 28px;
    text-align: center;
  }
  .page-header-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--mist);
    color: var(--moss);
    border-radius: 100px;
    padding: 5px 14px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-bottom: 14px;
  }
  .page-header-title {
    font-family: 'Lora', serif;
    font-size: clamp(24px, 5vw, 32px);
    font-weight: 600;
    color: var(--pine);
    line-height: 1.2;
    margin-bottom: 8px;
  }
  .page-header-sub {
    color: var(--gray);
    font-size: 14px;
    line-height: 1.6;
    max-width: 480px;
    margin: 0 auto;
  }

  /* ── FORM CARD ─── */
  .form-card {
    background: var(--white);
    border-radius: 20px;
    padding: 28px;
    box-shadow: var(--shadow-md);
    border: 1px solid rgba(0,0,0,0.04);
    margin-bottom: 20px;
  }
  .form-section-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--gray);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .form-section-title::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }
  .field-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
  .field-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--pine);
  }
  .field-input, .field-select {
    width: 100%;
    background: var(--light);
    border: 1.5px solid var(--border);
    border-radius: 12px;
    padding: 12px 16px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 14px;
    color: var(--forest);
    outline: none;
    transition: all 0.15s;
    appearance: none;
    -webkit-appearance: none;
  }
  .field-input:focus, .field-select:focus {
    border-color: var(--sage);
    background: var(--white);
    box-shadow: 0 0 0 3px rgba(82,183,136,0.15);
  }
  .select-wrap { position: relative; }
  .select-wrap .msymbol {
    position: absolute;
    right: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--gray);
    pointer-events: none;
    font-size: 18px;
  }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 480px) { .grid-2 { grid-template-columns: 1fr; } }

  /* ── DROPZONE ─── */
  .dropzone {
    border: 2px dashed var(--mist);
    border-radius: 16px;
    background: rgba(240,250,243,0.5);
    padding: 36px 24px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
  }
  .dropzone:hover, .dropzone.drag-over {
    border-color: var(--sage);
    background: rgba(82,183,136,0.06);
  }
  .dropzone input[type="file"] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    width: 100%;
    height: 100%;
    z-index: 2;
  }
  .dropzone-icon {
    width: 64px;
    height: 64px;
    background: var(--white);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
    box-shadow: var(--shadow-sm);
  }
  .dropzone-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--pine);
    margin-bottom: 6px;
  }
  .dropzone-sub {
    font-size: 12px;
    color: var(--gray);
  }

  /* ── PHOTO GRID ─── */
  .photo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 10px;
    margin-top: 16px;
  }
  .photo-thumb {
    aspect-ratio: 1;
    border-radius: 12px;
    overflow: hidden;
    position: relative;
    background: var(--light);
    cursor: pointer;
  }
  .photo-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .photo-thumb-remove {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 22px;
    height: 22px;
    background: var(--red);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s;
    cursor: pointer;
    border: none;
    color: white;
    z-index: 3;
  }
  .photo-thumb:hover .photo-thumb-remove { opacity: 1; }

  /* ── SUBMIT BUTTON ─── */
  .btn-primary {
    width: 100%;
    background: var(--pine);
    color: var(--white);
    border: none;
    border-radius: 16px;
    padding: 16px 24px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 16px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 16px rgba(26,58,42,0.25);
  }
  .btn-primary:hover { background: var(--forest); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(26,58,42,0.35); }
  .btn-primary:active { transform: scale(0.98); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
  .btn-gold {
    background: linear-gradient(135deg, var(--gold), var(--amber));
    color: var(--forest);
  }
  .btn-gold:hover { filter: brightness(1.05); background: linear-gradient(135deg, var(--amber), var(--gold)); }
  .btn-outline {
    background: transparent;
    border: 2px solid var(--pine);
    color: var(--pine);
    box-shadow: none;
  }
  .btn-outline:hover { background: var(--foam); }

  /* ── PROGRESS BAR ─── */
  .progress-wrap {
    background: var(--light);
    border-radius: 100px;
    height: 8px;
    overflow: hidden;
    margin: 8px 0;
  }
  .progress-fill {
    height: 100%;
    border-radius: 100px;
    background: linear-gradient(90deg, var(--sage), var(--moss));
    transition: width 0.5s ease;
  }

  /* ── UPLOAD STATUS ─── */
  .status-card {
    background: var(--white);
    border-radius: 20px;
    padding: 40px 28px;
    text-align: center;
    box-shadow: var(--shadow-md);
    border: 1px solid rgba(0,0,0,0.04);
  }
  .status-icon {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
  }
  .status-title {
    font-family: 'Lora', serif;
    font-size: 22px;
    font-weight: 600;
    color: var(--pine);
    margin-bottom: 8px;
  }
  .status-sub {
    color: var(--gray);
    font-size: 14px;
    line-height: 1.7;
    margin-bottom: 24px;
  }
  .path-pill {
    background: var(--foam);
    border: 1px solid var(--mist);
    border-radius: 10px;
    padding: 10px 16px;
    font-size: 12px;
    font-family: monospace;
    color: var(--moss);
    word-break: break-all;
    text-align: left;
    margin-bottom: 24px;
  }

  /* ── APIP PORTAL ─── */
  .apip-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }
  .stat-card {
    background: var(--white);
    border-radius: 14px;
    padding: 16px;
    text-align: center;
    box-shadow: var(--shadow-sm);
    border: 1px solid var(--border);
  }
  .stat-value {
    font-family: 'Lora', serif;
    font-size: 28px;
    font-weight: 600;
    color: var(--pine);
    line-height: 1;
    margin-bottom: 4px;
  }
  .stat-label {
    font-size: 11px;
    color: var(--gray);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  /* ── DESA ACCORDION ─── */
  .desa-card {
    background: var(--white);
    border-radius: 16px;
    border: 1.5px solid var(--border);
    overflow: hidden;
    margin-bottom: 12px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .desa-card.has-upload { border-color: var(--mist); }
  .desa-card.selected { border-color: var(--gold); box-shadow: 0 0 0 2px rgba(233,196,106,0.2); }
  .desa-card-header {
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 14px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .desa-card-header:hover { background: var(--light); }
  .desa-number {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--light);
    border: 1.5px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 800;
    color: var(--moss);
    flex-shrink: 0;
  }
  .desa-number.done {
    background: var(--pine);
    border-color: var(--pine);
    color: var(--white);
  }
  .desa-name {
    flex: 1;
    font-size: 15px;
    font-weight: 700;
    color: var(--forest);
  }
  .desa-meta {
    font-size: 12px;
    color: var(--gray);
    margin-top: 2px;
    font-weight: 400;
  }
  .desa-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border-radius: 100px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 700;
  }
  .badge-none { background: var(--light); color: var(--gray); border: 1px solid var(--border); }
  .badge-upload { background: var(--foam); color: var(--moss); border: 1px solid var(--mist); }
  .badge-selected { background: rgba(233,196,106,0.2); color: #b58a00; border: 1px solid var(--gold); }
  .desa-body {
    padding: 0 20px 20px;
    border-top: 1px solid var(--border);
  }
  .desa-body-inner { padding-top: 16px; }
  .no-photos {
    text-align: center;
    padding: 32px;
    color: var(--gray);
    font-size: 14px;
  }

  /* ── APIP PHOTO SELECT ─── */
  .apip-photo-thumb {
    aspect-ratio: 4/3;
    border-radius: 12px;
    overflow: hidden;
    position: relative;
    cursor: pointer;
    border: 3px solid transparent;
    transition: all 0.18s;
  }
  .apip-photo-thumb:hover { border-color: var(--sage); transform: scale(1.02); }
  .apip-photo-thumb.chosen { border-color: var(--gold); }
  .apip-photo-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .chosen-badge {
    position: absolute;
    inset: 0;
    background: rgba(233,196,106,0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  .chosen-check {
    width: 36px;
    height: 36px;
    background: var(--gold);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }
  .apip-photo-thumb .zoom-hint {
    position: absolute;
    bottom: 6px;
    right: 6px;
    background: rgba(0,0,0,0.55);
    color: white;
    border-radius: 8px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s;
    pointer-events: none;
  }
  .apip-photo-thumb:hover .zoom-hint { opacity: 1; }

  /* ── LIGHTBOX ─── */
  .lightbox-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.92);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    animation: fadeInLb 0.2s ease;
  }
  @keyframes fadeInLb {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .lightbox-inner {
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .lightbox-img {
    max-width: 90vw;
    max-height: 80vh;
    border-radius: 12px;
    object-fit: contain;
    box-shadow: 0 8px 60px rgba(0,0,0,0.6);
    animation: zoomInLb 0.25s cubic-bezier(0.34,1.56,0.64,1);
  }
  @keyframes zoomInLb {
    from { transform: scale(0.85); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  .lightbox-caption {
    color: rgba(255,255,255,0.75);
    font-size: 13px;
    font-weight: 600;
    text-align: center;
  }
  .lightbox-close {
    position: absolute;
    top: -44px;
    right: 0;
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.2);
    color: white;
    border-radius: 50%;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.15s;
    font-family: 'Material Symbols Outlined';
    font-size: 20px;
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  }
  .lightbox-close:hover { background: rgba(255,255,255,0.25); }
  .lightbox-actions {
    display: flex;
    gap: 10px;
  }
  .lightbox-btn {
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.25);
    color: white;
    border-radius: 10px;
    padding: 8px 18px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .lightbox-btn:hover { background: rgba(255,255,255,0.22); }
  .lightbox-btn.gold {
    background: rgba(233,196,106,0.25);
    border-color: var(--gold);
    color: var(--gold);
  }
  .lightbox-btn.gold.active {
    background: var(--gold);
    color: var(--forest);
  }
  .lightbox-btn.gold:hover { background: var(--gold); color: var(--forest); }

  /* ── GENERATE PANEL ─── */
  .generate-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--white);
    border-top: 1px solid var(--border);
    box-shadow: 0 -4px 24px rgba(13,40,24,0.1);
    padding: 16px 20px;
    z-index: 90;
  }
  .gen-inner {
    max-width: 720px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .gen-progress-text { flex: 1; }
  .gen-count {
    font-size: 22px;
    font-weight: 800;
    color: var(--pine);
    font-family: 'Lora', serif;
  }
  .gen-sub { font-size: 12px; color: var(--gray); }
  .gen-btn {
    flex-shrink: 0;
    background: linear-gradient(135deg, var(--gold), var(--amber));
    color: var(--forest);
    border: none;
    border-radius: 12px;
    padding: 12px 24px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 14px;
    font-weight: 800;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(233,196,106,0.4);
  }
  .gen-btn:hover { filter: brightness(1.05); transform: translateY(-1px); }
  .gen-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  /* ── OVERLAY ─── */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(13,40,24,0.7);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999;
    flex-direction: column;
    gap: 20px;
    padding: 24px;
  }
  .overlay-card {
    background: var(--white);
    border-radius: 24px;
    padding: 40px 32px;
    max-width: 360px;
    width: 100%;
    text-align: center;
    box-shadow: var(--shadow-lg);
  }
  .spinner {
    width: 48px;
    height: 48px;
    border: 3px solid var(--mist);
    border-top-color: var(--sage);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 20px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── TOAST ─── */
  .toast {
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    background: var(--forest);
    color: white;
    padding: 12px 20px;
    border-radius: 100px;
    font-size: 13px;
    font-weight: 600;
    opacity: 0;
    transition: all 0.3s;
    pointer-events: none;
    z-index: 1000;
    white-space: nowrap;
  }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

  /* Animations */
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .fade-up { animation: fadeUp 0.35s ease both; }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.9); }
    to { opacity: 1; transform: scale(1); }
  }
  .scale-in { animation: scaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both; }

  .apip-photo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
    margin-top: 8px;
  }
`;

// ─── TOAST HOOK ───────────────────────────────────────────────────────────────
function useToast() {
  const [msg, setMsg] = useState("");
  const [visible, setVisible] = useState(false);
  const t = useRef(null);
  const show = useCallback((m) => {
    setMsg(m);
    setVisible(true);
    clearTimeout(t.current);
    t.current = setTimeout(() => setVisible(false), 2800);
  }, []);
  return { msg, visible, show };
}

// ─── LIGHTBOX ─────────────────────────────────────────────────────────────────
function Lightbox({ src, caption, isChosen, onClose, onToggleChoose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-inner" onClick={e => e.stopPropagation()}>
        <button className="lightbox-close" onClick={onClose}>close</button>
        <img className="lightbox-img" src={src} alt={caption} />
        {caption && <div className="lightbox-caption">{caption}</div>}
        {onToggleChoose && (
          <div className="lightbox-actions">
            <button
              className={`lightbox-btn gold${isChosen ? " active" : ""}`}
              onClick={onToggleChoose}
            >
              <span style={{
                fontFamily: "'Material Symbols Outlined'",
                fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                fontSize: 16,
                lineHeight: 1
              }}>star</span>
              {isChosen ? "Terpilih untuk Laporan" : "Pilih untuk Laporan"}
            </button>
            <button className="lightbox-btn" onClick={onClose}>Tutup</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DOCX GENERATOR ───────────────────────────────────────────────────────────
async function generateDocx(jenis, tanggal, desaPhotos) {
  if (!window.JSZip) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  const zip = new window.JSZip();

  // Kumpulkan gambar
  const images = {}; // { desaName: { rId, ext, b64, mime } }
  let rIdN = 10;
  for (const desa of DESAS) {
    const dataUrl = desaPhotos[desa];
    if (!dataUrl || !dataUrl.startsWith("data:")) continue;
    const mime = dataUrl.match(/data:([^;]+);/)?.[1] || "image/jpeg";
    const ext = mime === "image/png" ? "png" : "jpeg";
    const b64 = dataUrl.split(",")[1];
    if (!b64 || b64.length < 100) continue;
    images[desa] = { rId: `rId${rIdN++}`, ext, b64, mime };
  }

  // Tambah gambar ke zip
  for (const desa of DESAS) {
    const img = images[desa];
    if (!img) continue;
    zip.file(`word/media/${safeName(desa)}.${img.ext}`, img.b64, { base64: true });
  }

  // relationships
  let rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  for (const desa of DESAS) {
    const img = images[desa];
    if (!img) continue;
    rels += `\n  <Relationship Id="${img.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${safeName(desa)}.${img.ext}"/>`;
  }
  rels += `\n</Relationships>`;

  // Helper: escape XML
  const xe = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");

  // Dimensi gambar (EMU): lebar penuh kolom kanan, rasio 4:3
  const W = 6400000;
  const H = 4800000;

  // Buat baris tabel per desa
  const rows = DESAS.map((desa, i) => {
    const bg = i % 2 === 0 ? "FFFFFF" : "D8F3DC";
    const img = images[desa];
    const photoCell = img ? `
      <w:tc>
        <w:tcPr><w:tcW w:w="10800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${bg}"/></w:tcPr>
        <w:p>
          <w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr>
          <w:r>
            <w:drawing>
              <wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
                <wp:extent cx="${W}" cy="${H}"/>
                <wp:docPr id="${i+1}" name="img${i+1}"/>
                <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                  <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                    <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                      <pic:nvPicPr>
                        <pic:cNvPr id="${i+1}" name="img${i+1}"/>
                        <pic:cNvPicPr/>
                      </pic:nvPicPr>
                      <pic:blipFill>
                        <a:blip r:embed="${img.rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                        <a:stretch><a:fillRect/></a:stretch>
                      </pic:blipFill>
                      <pic:spPr>
                        <a:xfrm><a:off x="0" y="0"/><a:ext cx="${W}" cy="${H}"/></a:xfrm>
                        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                      </pic:spPr>
                    </pic:pic>
                  </a:graphicData>
                </a:graphic>
              </wp:inline>
            </w:drawing>
          </w:r>
        </w:p>
      </w:tc>` : `
      <w:tc>
        <w:tcPr><w:tcW w:w="10800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${bg}"/></w:tcPr>
        <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
          <w:r><w:rPr><w:color w:val="999999"/><w:i/></w:rPr><w:t>[ Tidak ada foto ]</w:t></w:r>
        </w:p>
      </w:tc>`;

    return `<w:tr>
      <w:tc>
        <w:tcPr><w:tcW w:w="3600" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${bg}"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
          <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>${xe(`${i+1}. ${desa}`)}</w:t></w:r>
        </w:p>
        <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
          <w:r><w:rPr><w:sz w:val="18"/><w:color w:val="555555"/></w:rPr><w:t>${xe(jenis)}</w:t></w:r>
        </w:p>
        <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
          <w:r><w:rPr><w:sz w:val="18"/><w:color w:val="555555"/></w:rPr><w:t>${xe(formatDate(tanggal))}</w:t></w:r>
        </w:p>
      </w:tc>
      ${photoCell}
    </w:tr>`;
  }).join("\n");

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:color w:val="2D6A4F"/><w:sz w:val="48"/></w:rPr>
        <w:t>${xe(jenis.toUpperCase())}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/><w:spacing w:after="200"/></w:pPr>
      <w:r><w:rPr><w:color w:val="555555"/><w:sz w:val="24"/></w:rPr>
        <w:t>${xe(formatDate(tanggal))} — Kecamatan Siantan</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:spacing w:after="60"/></w:pPr>
      <w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">DISUSUN OLEH    :    ${xe(TEMPLATE.penyusun)}</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:spacing w:after="60"/></w:pPr>
      <w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">DIREVIU OLEH    :    ${xe(TEMPLATE.pereviu)}</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:spacing w:after="200"/></w:pPr>
      <w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">DISETUJUI OLEH  :    ${xe(TEMPLATE.penyetuju)}</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="14400" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="6" w:color="1A3A2A"/>
          <w:left w:val="single" w:sz="6" w:color="1A3A2A"/>
          <w:bottom w:val="single" w:sz="6" w:color="1A3A2A"/>
          <w:right w:val="single" w:sz="6" w:color="1A3A2A"/>
          <w:insideH w:val="single" w:sz="4" w:color="1A3A2A"/>
          <w:insideV w:val="single" w:sz="4" w:color="1A3A2A"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="3600"/>
        <w:gridCol w:w="10800"/>
      </w:tblGrid>
      <w:tr>
        <w:tc>
          <w:tcPr><w:tcW w:w="3600" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="2D6A4F"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
            <w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="24"/></w:rPr><w:t>NAMA DESA</w:t></w:r>
          </w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="10800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="2D6A4F"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
            <w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="24"/></w:rPr><w:t>DOKUMENTASI FOTO</w:t></w:r>
          </w:p>
        </w:tc>
      </w:tr>
      ${rows}
    </w:tbl>
    <w:p><w:pPr><w:spacing w:before="400"/></w:pPr></w:p>
    <w:sectPr>
      <w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  zip.file("word/document.xml", docXml);
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:sz w:val="22"/>
    </w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr>
      <w:spacing w:after="0" w:line="240" w:lineRule="auto"/>
    </w:pPr></w:pPrDefault>
  </w:docDefaults>
</w:styles>`);
  zip.file("word/_rels/document.xml.rels", rels);
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", compression: "DEFLATE" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Laporan_${jenis.replace(/[^a-zA-Z0-9]/g,"_")}_${tanggal}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function safeName(s) {
  return s.replace(/[^a-zA-Z0-9]/g, "_");
}

// ─── APIP PORTAL ─────────────────────────────────────────────────────────────

// Konversi URL foto Google Drive → dataURL (base64) via proxy fetch
async function urlToDataUrl(url) {
  const driveId =
    url.match(/\/d\/([a-zA-Z0-9_-]{10,})/)?.[1] ||
    url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/)?.[1] ||
    url.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/)?.[1];
  if (!driveId) throw new Error("Tidak bisa ekstrak Drive ID dari: " + url);

  // Fetch base64 via Apps Script agar bypass CORS
  const fetchUrl = `${APPS_SCRIPT_URL}?action=getFotoBase64&fileId=${encodeURIComponent(driveId)}`;
  let resp;
  try { resp = await fetch(fetchUrl); }
  catch (err) { throw new Error(`Network error: ${err.message}`); }
  if (!resp.ok) throw new Error(`Apps Script HTTP ${resp.status} — belum di-deploy ulang?`);
  let data;
  try { data = await resp.json(); }
  catch { throw new Error(`Response bukan JSON — Apps Script belum di-deploy ulang!`); }
  if (!data.success) throw new Error(`GS error: ${data.error || JSON.stringify(data)}`);
  if (!data.base64 || !data.mime) throw new Error(`base64/mime kosong: ${JSON.stringify(data)}`);
  const cleanBase64 = data.base64.replace(/[\s\r\n]/g, "");
  return `data:${data.mime};base64,${cleanBase64}`;
}

function ApipPortal({ onBack }) {
  const [jenis, setJenis] = useState("");
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().split("T")[0]);
  const [expandedDesa, setExpandedDesa] = useState(null);
  const [selectedPhotos, setSelectedPhotos] = useState({});
  const [generating, setGenerating] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const { msg: toastMsg, visible: toastVisible, show: showToast } = useToast();

  const key = storeKey(jenis, tanggal);
  const storeForKey = jenis && tanggal ? (globalPhotoStore[key] || {}) : {};
  const desasWithPhotos = DESAS.filter(d => (storeForKey[d] || []).length > 0);
  const selectedCount = Object.keys(selectedPhotos).filter(d => selectedPhotos[d]).length;

  // ✅ FIX: Fetch foto dari Google Drive setiap kali jenis/tanggal berubah
  useEffect(() => {
    if (!jenis || !tanggal) return;
    const fetchFromDrive = async () => {
      setLoadingPhotos(true);
      setSelectedPhotos({});
      try {
        const url = `${APPS_SCRIPT_URL}?action=getStatusSemua&jenis=${encodeURIComponent(jenis)}&tanggal=${encodeURIComponent(tanggal)}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.success && data.status) {
          const k = storeKey(jenis, tanggal);
          if (!globalPhotoStore[k]) globalPhotoStore[k] = {};
          // Konversi semua foto ke dataURL sekarang agar tampil tanpa CORS
          for (const [desaName, photos] of Object.entries(data.status)) {
            if (photos && photos.length > 0) {
              const dataUrls = await Promise.all(
                photos.map(async (p) => {
                  try {
                    return await urlToDataUrl(p.url);
                  } catch {
                    return p.url; // fallback ke URL asli jika gagal
                  }
                })
              );
              globalPhotoStore[k][desaName] = dataUrls;
            }
          }
        }
      } catch (err) {
        showToast("Gagal memuat foto dari Drive: " + err.message);
      }
      setLoadingPhotos(false);
    };
    fetchFromDrive();
  }, [jenis, tanggal]);

  const selectPhoto = (desa, url) => {
    setSelectedPhotos(p => ({ ...p, [desa]: p[desa] === url ? null : url }));
  };

  const openLightbox = (desa, url) => {
    setLightbox({ url, desa });
  };

  const handleGenerate = async () => {
    if (!jenis || !tanggal) { showToast("Pilih jenis kegiatan dan tanggal terlebih dahulu"); return; }
    if (selectedCount === 0) { showToast("Pilih minimal 1 foto dari 1 desa"); return; }
    setGenerating(true);
    try {
      // ✅ FIX: Konversi semua URL foto terpilih ke dataURL sebelum generate docx
    const desaList = Object.entries(selectedPhotos).filter(([, url]) => !!url);
      const desaPhotoDataUrls = {};
      let done = 0;
      for (const [desa, url] of desaList) {
        done++;
        showToast(`⏳ Foto ${done}/${desaList.length}: ${desa}...`);
        desaPhotoDataUrls[desa] = url.startsWith("data:")
          ? url
          : await urlToDataUrl(url);
      }
      showToast("📄 Menyusun dokumen...");
      await generateDocx(jenis, tanggal, desaPhotoDataUrls);
      showToast("✅ Laporan berhasil diunduh!");
    } catch (e) {
      console.error("[GIA]", e);
      showToast(`❌ ${e.message}`);
    } 
    setGenerating(false);
  };

  return (
    <div className="app-shell">
      {lightbox && (
        <Lightbox
          src={lightbox.url}
          caption={lightbox.desa}
          isChosen={selectedPhotos[lightbox.desa] === lightbox.url}
          onClose={() => setLightbox(null)}
          onToggleChoose={() => {
            selectPhoto(lightbox.desa, lightbox.url);
          }}
        />
      )}

      <header className="topbar">
        <button className="back-btn" onClick={onBack}>
          <span className="msymbol sm">arrow_back</span> Beranda
        </button>
        <div className="topbar-brand">
          <div className="topbar-brand-dot" style={{ background: "var(--gold)" }} />
          Gerakan Indonesia Asri
        </div>
        <div className="role-pill" style={{ color: "#b58a00", borderColor: "var(--gold)", background: "rgba(233,196,106,0.12)" }}>APIP</div>
      </header>

      <div className="content-area fade-up">
        <div className="page-header">
          <div className="page-header-chip" style={{ background: "rgba(233,196,106,0.2)", color: "#b58a00" }}>
            <span className="msymbol sm">assignment</span>
            Pengawas Internal
          </div>
          <h2 className="page-header-title">Portal APIP</h2>
          <p className="page-header-sub">Pilih foto terbaik dari setiap desa, lalu generate laporan rekap.</p>
        </div>

        <div className="form-card">
          <div className="form-section-title">
            <span className="msymbol sm">filter_list</span> Filter Data
          </div>
          <div className="grid-2">
            <div className="field-group">
              <label className="field-label">Jenis Kegiatan</label>
              <div className="select-wrap">
                <select className="field-select" value={jenis} onChange={e => { setJenis(e.target.value); setSelectedPhotos({}); }}>
                  <option value="">— Pilih jenis —</option>
                  {JENIS_KEGIATAN.map(j => <option key={j}>{j}</option>)}
                </select>
                <span className="msymbol">expand_more</span>
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">Tanggal Kegiatan</label>
              <input type="date" className="field-input" value={tanggal} onChange={e => { setTanggal(e.target.value); setSelectedPhotos({}); }} />
            </div>
          </div>
        </div>

        {jenis && tanggal && loadingPhotos && (
          <div className="form-card fade-up" style={{ textAlign: "center", padding: "20px", color: "var(--gray)" }}>
            <div style={{ width: 24, height: 24, border: "3px solid var(--mist)", borderTopColor: "var(--moss)", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 12px" }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>Memuat & memproses foto dari Google Drive...</div>
            <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>Mungkin perlu beberapa detik tergantung jumlah foto</div>
          </div>
        )}

        {jenis && tanggal && !loadingPhotos && (
          <div className="apip-stats fade-up">
            <div className="stat-card">
              <div className="stat-value">{DESAS.length}</div>
              <div className="stat-label">Total Desa</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: "var(--moss)" }}>{desasWithPhotos.length}</div>
              <div className="stat-label">Ada Foto</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: "#b58a00" }}>{selectedCount}</div>
              <div className="stat-label">Terpilih</div>
            </div>
          </div>
        )}

        {jenis && tanggal && selectedCount > 0 && (
          <div className="form-card fade-up" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: "var(--pine)" }}>Progres Pemilihan Foto</span>
              <span style={{ color: "var(--gray)" }}>{selectedCount} / {DESAS.length} desa</span>
            </div>
            <div className="progress-wrap">
              <div className="progress-fill" style={{ width: `${(selectedCount / DESAS.length) * 100}%`, background: "linear-gradient(90deg, var(--gold), var(--amber))" }} />
            </div>
          </div>
        )}

        {jenis && tanggal ? (
          <div style={{ marginBottom: 100 }}>
            <div className="form-section-title" style={{ marginBottom: 14 }}>
              <span className="msymbol sm">location_on</span> Daftar Desa / Kelurahan
            </div>
            {DESAS.map((d, i) => {
              const photos = storeForKey[d] || [];
              const hasPhotos = photos.length > 0;
              const chosen = selectedPhotos[d];
              const isOpen = expandedDesa === d;

              return (
                <div key={d} className={`desa-card${hasPhotos ? " has-upload" : ""}${chosen ? " selected" : ""}`}>
                  <div className="desa-card-header" onClick={() => setExpandedDesa(isOpen ? null : d)}>
                    <div className={`desa-number${chosen ? " done" : ""}`}>
                      {chosen
                        ? <span className="msymbol sm filled">check</span>
                        : i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="desa-name">{d}</div>
                      <div className="desa-meta">{hasPhotos ? `${photos.length} foto tersedia` : "Belum ada foto"}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {!hasPhotos && <span className="desa-badge badge-none"><span className="msymbol sm">hourglass_empty</span> Menunggu</span>}
                      {hasPhotos && !chosen && <span className="desa-badge badge-upload"><span className="msymbol sm">photo_library</span> Ada Foto</span>}
                      {chosen && <span className="desa-badge badge-selected"><span className="msymbol sm filled">star</span> Terpilih</span>}
                      {hasPhotos && (
                        <span className="msymbol" style={{
                          color: "var(--gray)",
                          transform: isOpen ? "rotate(180deg)" : "rotate(0)",
                          transition: "transform 0.25s"
                        }}>expand_more</span>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="desa-body fade-up">
                      <div className="desa-body-inner">
                        {!hasPhotos ? (
                          <div className="no-photos">
                            <span className="msymbol xl" style={{ color: "var(--border)", display: "block", marginBottom: 8 }}>photo_camera</span>
                            Belum ada foto yang dikirim dari desa ini
                          </div>
                        ) : (
                          <>
                            <p style={{ fontSize: 13, color: "var(--gray)", marginBottom: 12 }}>
                              Klik foto untuk <strong>memperbesar & memilih</strong>. Foto bertanda ⭐ akan masuk ke laporan.
                            </p>
                            <div className="apip-photo-grid">
                              {photos.map((url, pi) => (
                                <div
                                  key={pi}
                                  className={`apip-photo-thumb${chosen === url ? " chosen" : ""}`}
                                  onClick={() => openLightbox(d, url)}
                                >
                                  <img src={url} alt={`foto-${pi + 1}`} />
                                  {chosen === url && (
                                    <div className="chosen-badge">
                                      <div className="chosen-check">
                                        <span className="msymbol sm filled" style={{ color: "var(--forest)" }}>check</span>
                                      </div>
                                    </div>
                                  )}
                                  <div className="zoom-hint">
                                    <span className="msymbol sm">zoom_in</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                            {chosen && (
                              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--moss)", fontWeight: 600 }}>
                                <span className="msymbol sm filled" style={{ color: "var(--gold)" }}>star</span>
                                Foto terpilih untuk laporan rekap
                                <button
                                  style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--red)", fontSize: 12, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 4, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                                  onClick={() => selectPhoto(d, chosen)}
                                >
                                  <span className="msymbol sm">close</span> Batal
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--gray)" }}>
            <span className="msymbol xl" style={{ color: "var(--border)", display: "block", marginBottom: 16 }}>filter_list</span>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--pine)", marginBottom: 8 }}>Pilih Filter Terlebih Dahulu</div>
            <div style={{ fontSize: 14 }}>Pilih jenis kegiatan dan tanggal untuk melihat foto dari semua desa</div>
          </div>
        )}
      </div>

      {jenis && tanggal && (
        <div className="generate-panel">
          <div className="gen-inner">
            <div className="gen-progress-text">
              <div className="gen-count">
                {selectedCount}
                <span style={{ fontSize: 14, fontWeight: 400, color: "var(--gray)" }}>/{DESAS.length}</span>
              </div>
              <div className="gen-sub">desa sudah dipilih fotonya</div>
            </div>
            <button className="gen-btn" onClick={handleGenerate} disabled={selectedCount === 0 || generating}>
              {generating ? (
                <>
                  <div style={{ width: 16, height: 16, border: "2px solid var(--forest)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                  Membuat...
                </>
              ) : (
                <>
                  <span className="msymbol sm filled">download</span>
                  Download .docx
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div className={`toast${toastVisible ? " show" : ""}`}>{toastMsg}</div>
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [role, setRole] = useState(null);
  return (
    <>
      <style>{css}</style>
      {role === null && <RoleSelector onSelect={setRole} />}
      {role === "pic" && <DesaPortal onBack={() => setRole(null)} />}
      {role === "apip" && <ApipPortal onBack={() => setRole(null)} />}
    </>
  );
}
