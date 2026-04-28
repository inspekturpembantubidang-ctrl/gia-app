import { useState, useRef, useCallback, useEffect } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby_34rTFPzC7FzB2ZYmqh8dhXcnqm74dbeh4YIeYrsesnJyWVjKdBGORmxD2rujL376/exec";

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

const PIC_DATA: Record<string, { nama: string; hp: string }> = {
  "Desa Pesisir Timur":      { nama: "AGUS SALIM, SE",            hp: "082268484231"  },
  "Desa Sri Tanjung":        { nama: "Kevin",                      hp: "082213508920"  },
  "Desa Tarempa Barat":      { nama: "PURNAMA, S.I.P",            hp: "082387787403"  },
  "Desa Tarempa Barat Daya": { nama: "REBO YANTO",                hp: "82364825147"   },
  "Desa Tarempa Selatan":    { nama: "Marina",                     hp: "813556168793"  },
  "Desa Tarempa Timur":      { nama: "Desi Mainila Sari",          hp: "88272195261"   },
  "Kelurahan Tarempa":       { nama: "Agustina Aryantani, S.I.P", hp: "0812070420122" },
};

const APIP_USERS = [
  { nama: "Yopi Palintino, S.T.", password: "nyamnyam1993" },
];

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface DrivePhoto {
  fileId: string;
  url: string;       // thumbnail/proxy URL dari Apps Script
  filename: string;
}

// Global in-memory store — sekarang menyimpan DrivePhoto[], bukan string[]
const globalPhotoStore: Record<string, Record<string, DrivePhoto[]>> = {};

function storeKey(jenis: string, tanggal: string) {
  return `${jenis}__${tanggal}`;
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function formatDate(iso: string) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  return `${d} ${months[+m - 1]} ${y}`;
}

// Buat URL proxy foto via Apps Script (bypass CORS Google Drive)
function proxyUrl(fileId: string) {
  return `${APPS_SCRIPT_URL}?action=getPhoto&fileId=${fileId}`;
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
  .role-title em { font-style: italic; color: var(--gold); }
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
  @media (max-width: 500px) { .role-cards { grid-template-columns: 1fr; } }
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
  .role-card:hover { transform: translateY(-6px) scale(1.02); border-color: rgba(255,255,255,0.35); background: rgba(255,255,255,0.14); box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
  .role-card:hover::before { opacity: 1; }
  .role-card:active { transform: scale(0.97); }
  .role-icon { width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; }
  .role-card-title { color: #fff; font-size: 18px; font-weight: 800; line-height: 1.2; }
  .role-card-desc { color: rgba(255,255,255,0.55); font-size: 13px; line-height: 1.6; flex: 1; }
  .role-arrow { display: inline-flex; align-items: center; gap: 6px; color: var(--gold); font-size: 13px; font-weight: 700; }
  .wa-link { margin-top: 48px; display: inline-flex; align-items: center; gap: 8px; color: rgba(255,255,255,0.4); font-size: 13px; text-decoration: none; transition: color 0.2s; }
  .wa-link:hover { color: rgba(255,255,255,0.8); }

  .app-shell { min-height: 100dvh; display: flex; flex-direction: column; background: var(--foam); }
  .topbar {
    position: sticky; top: 0; z-index: 100;
    background: var(--white); border-bottom: 1px solid var(--border);
    box-shadow: var(--shadow-sm); padding: 0 20px; height: 60px;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
  }
  .topbar-brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 15px; color: var(--pine); }
  .topbar-brand-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--sage); }
  .back-btn {
    display: flex; align-items: center; gap: 6px;
    background: var(--light); border: 1px solid var(--border); border-radius: 100px;
    padding: 6px 14px 6px 10px; font-size: 13px; font-weight: 600; color: var(--pine);
    cursor: pointer; transition: all 0.15s;
  }
  .back-btn:hover { background: var(--foam); border-color: var(--sage); }
  .role-pill { background: var(--foam); border: 1px solid var(--mist); border-radius: 100px; padding: 5px 14px; font-size: 12px; font-weight: 700; color: var(--moss); }
  .content-area { flex: 1; padding: 28px 20px 100px; max-width: 720px; margin: 0 auto; width: 100%; }

  .page-header { margin-bottom: 28px; text-align: center; }
  .page-header-chip {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--mist); color: var(--moss); border-radius: 100px;
    padding: 5px 14px; font-size: 11px; font-weight: 800;
    letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 14px;
  }
  .page-header-title { font-family: 'Lora', serif; font-size: clamp(24px, 5vw, 32px); font-weight: 600; color: var(--pine); line-height: 1.2; margin-bottom: 8px; }
  .page-header-sub { color: var(--gray); font-size: 14px; line-height: 1.6; max-width: 480px; margin: 0 auto; }

  .form-card { background: var(--white); border-radius: 20px; padding: 28px; box-shadow: var(--shadow-md); border: 1px solid rgba(0,0,0,0.04); margin-bottom: 20px; }
  .form-section-title {
    font-size: 13px; font-weight: 700; color: var(--gray);
    text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 16px;
    display: flex; align-items: center; gap: 8px;
  }
  .form-section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }
  .field-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
  .field-label { font-size: 13px; font-weight: 600; color: var(--pine); }
  .field-input, .field-select {
    width: 100%; background: var(--light); border: 1.5px solid var(--border);
    border-radius: 12px; padding: 12px 16px; font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 14px; color: var(--forest); outline: none; transition: all 0.15s;
    appearance: none; -webkit-appearance: none;
  }
  .field-input:focus, .field-select:focus { border-color: var(--sage); background: var(--white); box-shadow: 0 0 0 3px rgba(82,183,136,0.15); }
  .select-wrap { position: relative; }
  .select-wrap .msymbol { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); color: var(--gray); pointer-events: none; font-size: 18px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 480px) { .grid-2 { grid-template-columns: 1fr; } }

  .dropzone {
    border: 2px dashed var(--mist); border-radius: 16px;
    background: rgba(240,250,243,0.5); padding: 36px 24px;
    text-align: center; cursor: pointer; transition: all 0.2s; position: relative;
  }
  .dropzone:hover, .dropzone.drag-over { border-color: var(--sage); background: rgba(82,183,136,0.06); }
  .dropzone input[type="file"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; z-index: 2; }
  .dropzone-icon { width: 64px; height: 64px; background: var(--white); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; box-shadow: var(--shadow-sm); }
  .dropzone-title { font-size: 15px; font-weight: 700; color: var(--pine); margin-bottom: 6px; }
  .dropzone-sub { font-size: 12px; color: var(--gray); }

  .photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px; margin-top: 16px; }
  .photo-thumb { aspect-ratio: 1; border-radius: 12px; overflow: hidden; position: relative; background: var(--light); cursor: pointer; }
  .photo-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .photo-thumb-remove {
    position: absolute; top: 4px; right: 4px; width: 22px; height: 22px;
    background: var(--red); border-radius: 50%; display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.15s; cursor: pointer; border: none; color: white; z-index: 3;
  }
  .photo-thumb:hover .photo-thumb-remove { opacity: 1; }

  .btn-primary {
    width: 100%; background: var(--pine); color: var(--white); border: none;
    border-radius: 16px; padding: 16px 24px; font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 16px; font-weight: 800; display: flex; align-items: center; justify-content: center;
    gap: 10px; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 16px rgba(26,58,42,0.25);
  }
  .btn-primary:hover { background: var(--forest); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(26,58,42,0.35); }
  .btn-primary:active { transform: scale(0.98); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
  .btn-gold { background: linear-gradient(135deg, var(--gold), var(--amber)); color: var(--forest); }
  .btn-gold:hover { filter: brightness(1.05); background: linear-gradient(135deg, var(--amber), var(--gold)); }
  .btn-outline { background: transparent; border: 2px solid var(--pine); color: var(--pine); box-shadow: none; }
  .btn-outline:hover { background: var(--foam); }

  .progress-wrap { background: var(--light); border-radius: 100px; height: 8px; overflow: hidden; margin: 8px 0; }
  .progress-fill { height: 100%; border-radius: 100px; background: linear-gradient(90deg, var(--sage), var(--moss)); transition: width 0.5s ease; }

  .status-card { background: var(--white); border-radius: 20px; padding: 40px 28px; text-align: center; box-shadow: var(--shadow-md); border: 1px solid rgba(0,0,0,0.04); }
  .status-icon { width: 72px; height: 72px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
  .status-title { font-family: 'Lora', serif; font-size: 22px; font-weight: 600; color: var(--pine); margin-bottom: 8px; }
  .status-sub { color: var(--gray); font-size: 14px; line-height: 1.7; margin-bottom: 24px; }
  .path-pill { background: var(--foam); border: 1px solid var(--mist); border-radius: 10px; padding: 10px 16px; font-size: 12px; font-family: monospace; color: var(--moss); word-break: break-all; text-align: left; margin-bottom: 24px; }

  .apip-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
  .stat-card { background: var(--white); border-radius: 14px; padding: 16px; text-align: center; box-shadow: var(--shadow-sm); border: 1px solid var(--border); }
  .stat-value { font-family: 'Lora', serif; font-size: 28px; font-weight: 600; color: var(--pine); line-height: 1; margin-bottom: 4px; }
  .stat-label { font-size: 11px; color: var(--gray); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }

  .desa-card { background: var(--white); border-radius: 16px; border: 1.5px solid var(--border); overflow: hidden; margin-bottom: 12px; transition: border-color 0.2s, box-shadow 0.2s; }
  .desa-card.has-upload { border-color: var(--mist); }
  .desa-card.selected { border-color: var(--gold); box-shadow: 0 0 0 2px rgba(233,196,106,0.2); }
  .desa-card-header { padding: 16px 20px; display: flex; align-items: center; gap: 14px; cursor: pointer; transition: background 0.15s; }
  .desa-card-header:hover { background: var(--light); }
  .desa-number { width: 32px; height: 32px; border-radius: 50%; background: var(--light); border: 1.5px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; color: var(--moss); flex-shrink: 0; }
  .desa-number.done { background: var(--pine); border-color: var(--pine); color: var(--white); }
  .desa-name { flex: 1; font-size: 15px; font-weight: 700; color: var(--forest); }
  .desa-meta { font-size: 12px; color: var(--gray); margin-top: 2px; font-weight: 400; }
  .desa-badge { display: inline-flex; align-items: center; gap: 4px; border-radius: 100px; padding: 4px 10px; font-size: 11px; font-weight: 700; }
  .badge-none { background: var(--light); color: var(--gray); border: 1px solid var(--border); }
  .badge-upload { background: var(--foam); color: var(--moss); border: 1px solid var(--mist); }
  .badge-selected { background: rgba(233,196,106,0.2); color: #b58a00; border: 1px solid var(--gold); }
  .desa-body { padding: 0 20px 20px; border-top: 1px solid var(--border); }
  .desa-body-inner { padding-top: 16px; }
  .no-photos { text-align: center; padding: 32px; color: var(--gray); font-size: 14px; }

  .apip-photo-thumb { aspect-ratio: 4/3; border-radius: 12px; overflow: hidden; position: relative; cursor: pointer; border: 3px solid transparent; transition: all 0.18s; background: var(--light); }
  .apip-photo-thumb:hover { border-color: var(--sage); transform: scale(1.02); }
  .apip-photo-thumb.chosen { border-color: var(--gold); }
  .apip-photo-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .apip-photo-thumb .img-loading { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--gray); font-size: 12px; flex-direction: column; gap: 8px; }
  .chosen-badge { position: absolute; inset: 0; background: rgba(233,196,106,0.35); display: flex; align-items: center; justify-content: center; pointer-events: none; }
  .chosen-check { width: 36px; height: 36px; background: var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
  .apip-photo-thumb .zoom-hint { position: absolute; bottom: 6px; right: 6px; background: rgba(0,0,0,0.55); color: white; border-radius: 8px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.15s; pointer-events: none; }
  .apip-photo-thumb:hover .zoom-hint { opacity: 1; }

  .lightbox-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.92); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 16px; animation: fadeInLb 0.2s ease; }
  @keyframes fadeInLb { from { opacity: 0; } to { opacity: 1; } }
  .lightbox-inner { position: relative; max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; align-items: center; gap: 16px; }
  .lightbox-img { max-width: 90vw; max-height: 80vh; border-radius: 12px; object-fit: contain; box-shadow: 0 8px 60px rgba(0,0,0,0.6); animation: zoomInLb 0.25s cubic-bezier(0.34,1.56,0.64,1); }
  @keyframes zoomInLb { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  .lightbox-caption { color: rgba(255,255,255,0.75); font-size: 13px; font-weight: 600; text-align: center; }
  .lightbox-close { position: absolute; top: -44px; right: 0; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.15s; font-family: 'Material Symbols Outlined'; font-size: 20px; font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
  .lightbox-close:hover { background: rgba(255,255,255,0.25); }
  .lightbox-actions { display: flex; gap: 10px; }
  .lightbox-btn { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.25); color: white; border-radius: 10px; padding: 8px 18px; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 6px; }
  .lightbox-btn:hover { background: rgba(255,255,255,0.22); }
  .lightbox-btn.gold { background: rgba(233,196,106,0.25); border-color: var(--gold); color: var(--gold); }
  .lightbox-btn.gold.active { background: var(--gold); color: var(--forest); }
  .lightbox-btn.gold:hover { background: var(--gold); color: var(--forest); }

  .generate-panel { position: fixed; bottom: 0; left: 0; right: 0; background: var(--white); border-top: 1px solid var(--border); box-shadow: 0 -4px 24px rgba(13,40,24,0.1); padding: 16px 20px; z-index: 90; }
  .gen-inner { max-width: 720px; margin: 0 auto; display: flex; align-items: center; gap: 16px; }
  .gen-progress-text { flex: 1; }
  .gen-count { font-size: 22px; font-weight: 800; color: var(--pine); font-family: 'Lora', serif; }
  .gen-sub { font-size: 12px; color: var(--gray); }
  .gen-btn { flex-shrink: 0; background: linear-gradient(135deg, var(--gold), var(--amber)); color: var(--forest); border: none; border-radius: 12px; padding: 12px 24px; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; font-weight: 800; display: flex; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(233,196,106,0.4); }
  .gen-btn:hover { filter: brightness(1.05); transform: translateY(-1px); }
  .gen-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .overlay { position: fixed; inset: 0; background: rgba(13,40,24,0.7); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 999; flex-direction: column; gap: 20px; padding: 24px; }
  .overlay-card { background: var(--white); border-radius: 24px; padding: 40px 32px; max-width: 360px; width: 100%; text-align: center; box-shadow: var(--shadow-lg); }
  .spinner { width: 48px; height: 48px; border: 3px solid var(--mist); border-top-color: var(--sage); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 20px; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .toast { position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%) translateY(20px); background: var(--forest); color: white; padding: 12px 20px; border-radius: 100px; font-size: 13px; font-weight: 600; opacity: 0; transition: all 0.3s; pointer-events: none; z-index: 1000; white-space: nowrap; }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

  @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  .fade-up { animation: fadeUp 0.35s ease both; }
  @keyframes scaleIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
  .scale-in { animation: scaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both; }

  .apip-photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin-top: 8px; }

  .retry-info { font-size: 12px; color: var(--amber); margin-top: 8px; font-weight: 600; }

  .fetch-status { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: 12px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
  .fetch-status.loading { background: var(--foam); color: var(--moss); border: 1px solid var(--mist); }
  .fetch-status.error { background: #fff5f5; color: var(--red); border: 1px solid #ffd5d5; }
  .fetch-spin { width: 16px; height: 16px; border: 2px solid var(--mist); border-top-color: var(--sage); border-radius: 50%; animation: spin 0.8s linear infinite; flex-shrink: 0; }

  .refresh-btn { display: inline-flex; align-items: center; gap: 6px; background: var(--foam); border: 1px solid var(--mist); border-radius: 100px; padding: 6px 14px; font-size: 12px; font-weight: 700; color: var(--moss); cursor: pointer; transition: all 0.15s; margin-left: auto; }
  .refresh-btn:hover { background: var(--mist); }
`;

// ─── TOAST HOOK ───────────────────────────────────────────────────────────────
function useToast() {
  const [msg, setMsg] = useState("");
  const [visible, setVisible] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    setVisible(true);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setVisible(false), 2800);
  }, []);
  return { msg, visible, show };
}

// ─── LIGHTBOX ─────────────────────────────────────────────────────────────────
function Lightbox({ src, caption, isChosen, onClose, onToggleChoose }: {
  src: string;
  caption?: string;
  isChosen?: boolean;
  onClose: () => void;
  onToggleChoose?: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
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
            <button className={`lightbox-btn gold${isChosen ? " active" : ""}`} onClick={onToggleChoose}>
              <span style={{ fontFamily: "'Material Symbols Outlined'", fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24", fontSize: 16, lineHeight: 1 }}>star</span>
              {isChosen ? "Terpilih untuk Laporan" : "Pilih untuk Laporan"}
            </button>
            <button className="lightbox-btn" onClick={onClose}>Tutup</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LAZY IMAGE (untuk foto dari Drive via proxy) ─────────────────────────────
function DriveImage({ fileId, alt, className }: { fileId: string; alt?: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    setSrc(null); setErr(false);
    // Gunakan thumbnail Google Drive langsung (tidak perlu CORS)
    // Format: https://drive.google.com/thumbnail?id=FILE_ID&sz=w400
    const thumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`;
    setSrc(thumbUrl);
  }, [fileId]);

  if (err) return (
    <div className="img-loading">
      <span className="msymbol sm" style={{ color: "var(--border)" }}>broken_image</span>
      <span style={{ fontSize: 11 }}>Gagal load</span>
    </div>
  );

  if (!src) return (
    <div className="img-loading">
      <div style={{ width: 20, height: 20, border: "2px solid var(--mist)", borderTopColor: "var(--sage)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  return <img src={src} alt={alt} className={className} onError={() => setErr(true)} />;
}

// ─── DOCX GENERATOR ───────────────────────────────────────────────────────────
async function generateDocx(jenis: string, tanggal: string, desaPhotos: Record<string, DrivePhoto | null>) {
  if (!(window as unknown as Record<string, unknown>).JSZip) {
    await new Promise<void>((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = () => res(); s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  const COL1 = 1545; const COL2 = 3825; const COL3 = 1575; const COL4 = 3660;
  const TBL_W = COL1 + COL2 + COL3 + COL4;
  const FOTO_W = 2418715; const FOTO_H = 1914525;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const JSZip = (window as unknown as Record<string, any>).JSZip;
  const zip = new JSZip();
  const imgRels: ({ rId: string; partName: string; mime: string } | null)[] = [];
  let rIdCounter = 2;
  const imageParts: Record<string, string> = {};

  // Fetch foto dari Google Drive thumbnail dan convert ke base64
  for (let i = 0; i < DESAS.length; i++) {
    const photo = desaPhotos[DESAS[i]];
    if (photo) {
      try {
        // Ambil foto via thumbnail Google Drive
       const proxyUrl = `${APPS_SCRIPT_URL}?action=getPhoto&fileId=${photo.fileId}`;
const resp = await fetch(proxyUrl);
const b64 = await resp.text();
const mime = "image/jpeg";
const ext = "jpeg";
        const rId = `rId${rIdCounter++}`;
        const partName = `media/img${i + 1}.${ext}`;
        imgRels.push({ rId, partName, mime });
        imageParts[partName] = b64;
      } catch {
        imgRels.push(null);
      }
    } else {
      imgRels.push(null);
    }
  }

  let relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  imgRels.forEach(r => {
    if (r) relsXml += `\n  <Relationship Id="${r.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${r.partName}"/>`;
  });
  relsXml += `\n</Relationships>`;

  function makePhotoCell(colW: number, rel: { rId: string; partName: string; mime: string } | null, idx: number) {
    if (rel) {
      return `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="114300" distB="114300" distL="114300" distR="114300" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${FOTO_W}" cy="${FOTO_H}"/><wp:effectExtent l="0" t="0" r="635" b="9525"/><wp:docPr id="${idx + 10}" name="Foto${idx + 1}"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${idx + 10}" name="Foto${idx + 1}"/><pic:cNvPicPr preferRelativeResize="0"/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rel.rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${FOTO_W}" cy="${FOTO_H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:tc>`;
    } else {
      return `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="999999"/><w:i/></w:rPr><w:t>[ Tidak ada foto ]</w:t></w:r></w:p></w:tc>`;
    }
  }

  function makeNameCell(colW: number, desaName: string) {
    return `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:t>${desaName}</w:t></w:r></w:p></w:tc>`;
  }

  function makeEmptyCell(colW: number) {
    return `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p></w:tc>`;
  }

  let tableRows = "";
  for (let row = 0; row < 4; row++) {
    const leftIdx = row * 2; const rightIdx = row * 2 + 1;
    const leftDesa = DESAS[leftIdx] || null; const rightDesa = DESAS[rightIdx] || null;
    const leftRel = leftDesa ? imgRels[leftIdx] : null; const rightRel = rightDesa ? imgRels[rightIdx] : null;
    tableRows += `<w:tr><w:trPr><w:trHeight w:val="3005"/></w:trPr>${leftDesa ? makeNameCell(COL1, leftDesa) : makeEmptyCell(COL1)}${leftDesa ? makePhotoCell(COL2, leftRel, leftIdx) : makeEmptyCell(COL2)}${rightDesa ? makeNameCell(COL3, rightDesa) : makeEmptyCell(COL3)}${rightDesa ? makePhotoCell(COL4, rightRel, rightIdx) : makeEmptyCell(COL4)}</w:tr>`;
  }

  function makeHeaderLine(label: string, value: string) {
    return `<w:p><w:pPr><w:spacing w:after="0"/><w:tabs><w:tab w:val="left" w:pos="2268"/><w:tab w:val="left" w:pos="3261"/></w:tabs></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${label}</w:t><w:tab/><w:t>:</w:t><w:tab/><w:t>${value}</w:t></w:r></w:p>`;
  }

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14">
  <w:body>
    ${makeHeaderLine("DISUSUN OLEH", TEMPLATE.penyusun)}
    ${makeHeaderLine("DIREVIU OLEH", TEMPLATE.pereviu)}
    ${makeHeaderLine("DISETUJUI OLEH", TEMPLATE.penyetuju)}
    <w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>
    <w:tbl>
      <w:tblPr><w:tblW w:w="${TBL_W}" w:type="dxa"/><w:tblInd w:w="-123" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>
      <w:tblGrid><w:gridCol w:w="${COL1}"/><w:gridCol w:w="${COL2}"/><w:gridCol w:w="${COL3}"/><w:gridCol w:w="${COL4}"/></w:tblGrid>
      ${tableRows}
    </w:tbl>
    <w:p/>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="id-ID"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
</w:styles>`;

  zip.folder("word"); zip.folder("word/media"); zip.folder("word/_rels"); zip.folder("_rels");
  zip.file("word/document.xml", docXml);
  zip.file("word/styles.xml", stylesXml);
  zip.file("word/_rels/document.xml.rels", relsXml);
  for (const [name, b64] of Object.entries(imageParts)) { zip.file(`word/${name}`, b64, { base64: true }); }
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);

  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `Laporan_${jenis.replace(/[^a-zA-Z0-9]/g, "_")}_${tanggal}.docx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─── ROLE SELECTOR ────────────────────────────────────────────────────────────
function RoleSelector({ onSelect }: { onSelect: (role: string) => void }) {
  return (
    <div className="role-bg">
      <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 640, width: "100%" }}>
        <div className="brand-badge">
          <span className="msymbol sm" style={{ color: "var(--mist)" }}>eco</span>
          Gerakan Indonesia Asri
        </div>
        <h1 className="role-title">Dokumentasi<br /><em>Kebersihan Desa</em></h1>
        <p className="role-subtitle">Platform terpadu untuk mencatat dan merekap kegiatan Jum'at Bersih &amp; Selasa Goro Kecamatan Siantan.</p>
        <div className="role-cards">
          <div className="role-card" onClick={() => onSelect("pic")}>
            <div className="role-icon" style={{ background: "rgba(82,183,136,0.2)" }}>
              <span className="msymbol lg" style={{ color: "var(--sage)" }}>upload</span>
            </div>
            <div>
              <div className="role-card-title">Portal<br />PIC Desa</div>
              <div className="role-card-desc">Upload foto dokumentasi kegiatan kebersihan di wilayah Anda</div>
            </div>
            <div className="role-arrow">Masuk <span className="msymbol sm">arrow_forward</span></div>
          </div>
          <div className="role-card" onClick={() => onSelect("apip")}>
            <div className="role-icon" style={{ background: "rgba(233,196,106,0.2)" }}>
              <span className="msymbol lg" style={{ color: "var(--gold)" }}>assignment</span>
            </div>
            <div>
              <div className="role-card-title">Portal<br />APIP</div>
              <div className="role-card-desc">Tinjau foto dari semua desa dan generate laporan rekap .docx</div>
            </div>
            <div className="role-arrow" style={{ color: "var(--gold)" }}>Masuk <span className="msymbol sm">arrow_forward</span></div>
          </div>
        </div>
        <a className="wa-link" href="https://wa.me/6281267426804" target="_blank" rel="noopener noreferrer">
          <span className="msymbol sm">phone</span>
          APIP: Yopi Palintino, S.T. — 0812-6742-6804
        </a>
      </div>
    </div>
  );
}

// ─── PIC DESA PORTAL ─────────────────────────────────────────────────────────
function DesaPortal({ onBack }: { onBack: () => void }) {
  const [desa, setDesa] = useState("");
  const [jenis, setJenis] = useState("");
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().split("T")[0]);
  const [photos, setPhotos] = useState<{ file: File; dataUrl: string }[]>([]);
  const [screen, setScreen] = useState("form");
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [uploadStatus, setUploadStatus] = useState("");
  const [successPath, setSuccessPath] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; idx: number } | null>(null);
  const { msg: toastMsg, visible: toastVisible, show: showToast } = useToast();

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter(f => f.type.startsWith("image/") && f.size <= 5 * 1024 * 1024);
    const tooLarge = Array.from(files).filter(f => f.size > 5 * 1024 * 1024);
    if (tooLarge.length) showToast(`${tooLarge.length} file terlalu besar (maks 10mb)`);
    const newPhotos = await Promise.all(valid.map(async (f) => ({ file: f, dataUrl: await fileToDataURL(f) })));
    setPhotos(p => [...p, ...newPhotos].slice(0, 10));
  }, [showToast]);

  const removePhoto = (i: number) => setPhotos(p => p.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!desa || !jenis || !tanggal) { showToast("Lengkapi semua data terlebih dahulu"); return; }
    if (photos.length === 0) { showToast("Upload minimal 1 foto"); return; }
    setScreen("uploading");
    setUploadProgress({ current: 0, total: photos.length });
    setUploadStatus("Mempersiapkan...");

    try {
      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        setUploadStatus(`Mengirim foto ${i + 1} dari ${photos.length}...`);

        const b64 = await fileToBase64(p.file);
        const payload = {
          desa, jenis, tanggal,
          filename: `${desa.replace(/\s+/g, "_")}_${jenis.replace(/[^a-zA-Z0-9]/g, "_")}_${tanggal}_foto${i + 1}.${p.file.name.split(".").pop()}`,
          mimeType: p.file.type,
          base64: b64,
        };

        let success = false;
        let lastError = "";
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            if (attempt > 1) {
              setUploadStatus(`Foto ${i + 1}: mencoba ulang (percobaan ${attempt}/3)...`);
              await new Promise(r => setTimeout(r, 2000 * attempt));
            }
            await fetch(APPS_SCRIPT_URL, {
              method: "POST",
              mode: "no-cors",
              body: JSON.stringify(payload),
            });
            success = true;
            break;
          } catch (e) {
            lastError = (e as Error).message;
          }
        }

        if (!success) {
          throw new Error(`Foto ${i + 1} gagal setelah 3 percobaan: ${lastError}`);
        }

        setUploadProgress({ current: i + 1, total: photos.length });
      }

      setSuccessPath(`Desa Kecamatan Siantan / ${desa} / ${jenis} / ${tanggal}`);
      setScreen("success");
    } catch (e) {
      setErrorMsg((e as Error).message || "Gagal mengirim foto. Coba lagi.");
      setScreen("error");
    }
  };

  const reset = () => { setPhotos([]); setScreen("form"); setUploadProgress({ current: 0, total: 0 }); setUploadStatus(""); };

  if (screen === "uploading") {
    const pct = uploadProgress.total ? Math.round((uploadProgress.current / uploadProgress.total) * 100) : 0;
    return (
      <div className="app-shell">
        <div className="overlay">
          <div className="overlay-card scale-in">
            <div className="spinner" />
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--pine)", marginBottom: 8 }}>Mengirim Foto...</div>
            <div style={{ fontSize: 13, color: "var(--gray)", marginBottom: 4 }}>{uploadProgress.current} dari {uploadProgress.total} foto</div>
            {uploadStatus && <div className="retry-info">{uploadStatus}</div>}
            <div className="progress-wrap" style={{ marginTop: 12 }}>
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 8 }}>{pct}%</div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "success") {
    return (
      <div className="app-shell">
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div className="status-card scale-in" style={{ maxWidth: 420, width: "100%" }}>
            <div className="status-icon" style={{ background: "var(--foam)", border: "2px solid var(--mist)" }}>
              <span className="msymbol xl filled" style={{ color: "var(--sage)" }}>check_circle</span>
            </div>
            <div className="status-title">Foto Berhasil Terkirim!</div>
            <div className="status-sub">{uploadProgress.total} foto dari <strong>{desa}</strong> berhasil tersimpan.</div>
            <div className="path-pill">📁 {successPath}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button className="btn-primary" onClick={reset}>
                <span className="msymbol sm">add_a_photo</span> Upload Foto Lagi
              </button>
              <button className="btn-primary btn-outline" onClick={onBack}>
                <span className="msymbol sm">home</span> Kembali ke Beranda
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "error") {
    return (
      <div className="app-shell">
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div className="status-card scale-in" style={{ maxWidth: 420, width: "100%" }}>
            <div className="status-icon" style={{ background: "#fff5f5", border: "2px solid #ffd5d5" }}>
              <span className="msymbol xl" style={{ color: "var(--red)" }}>error</span>
            </div>
            <div className="status-title" style={{ color: "var(--red)" }}>Terjadi Kesalahan</div>
            <div className="status-sub">{errorMsg || "Gagal mengirim foto. Coba lagi."}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-primary btn-outline" style={{ flex: 1 }} onClick={onBack}>Kembali</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={handleSubmit}>
                <span className="msymbol sm">refresh</span> Coba Lagi
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {lightbox && (
        <Lightbox src={lightbox.url} caption={`Foto ${lightbox.idx + 1}`} onClose={() => setLightbox(null)} />
      )}
      <header className="topbar">
        <button className="back-btn" onClick={onBack}>
          <span className="msymbol sm">arrow_back</span> Beranda
        </button>
        <div className="topbar-brand">
          <div className="topbar-brand-dot" />
          Gerakan Indonesia Asri
        </div>
        <div className="role-pill">PIC Desa</div>
      </header>

      <div className="content-area fade-up">
        <div className="page-header">
          <div className="page-header-chip">
            <span className="msymbol sm">upload</span>
            Petugas Lapangan
          </div>
          <h2 className="page-header-title">Portal PIC Desa</h2>
          <p className="page-header-sub">Dokumentasikan kegiatan kebersihan di wilayah Anda.</p>
        </div>

        <div className="form-card">
          <div className="form-section-title">
            <span className="msymbol sm">location_on</span> Data Kegiatan
          </div>
          <div className="field-group">
            <label className="field-label">Pilih Desa / Kelurahan</label>
            <div className="select-wrap">
              <select className="field-select" value={desa} onChange={e => setDesa(e.target.value)}>
                <option value="">— Pilih wilayah kerja —</option>
                {DESAS.map(d => <option key={d}>{d}</option>)}
              </select>
              <span className="msymbol">expand_more</span>
            </div>
          </div>
          <div className="grid-2">
            <div className="field-group">
              <label className="field-label">Jenis Kegiatan</label>
              <div className="select-wrap">
                <select className="field-select" value={jenis} onChange={e => setJenis(e.target.value)}>
                  <option value="">— Pilih kategori —</option>
                  {JENIS_KEGIATAN.map(j => <option key={j}>{j}</option>)}
                </select>
                <span className="msymbol">cleaning_services</span>
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">Tanggal Pelaksanaan</label>
              <input type="date" className="field-input" value={tanggal} onChange={e => setTanggal(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="form-card">
          <div className="form-section-title">
            <span className="msymbol sm">photo_library</span> Foto Dokumentasi
            {photos.length > 0 && (
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--moss)", fontWeight: 700, textTransform: "none", letterSpacing: 0 }}>
                {photos.length} foto
              </span>
            )}
          </div>
          <div
            className={`dropzone${dragOver ? " drag-over" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          >
            <input type="file" accept="image/*" multiple onChange={e => handleFiles(e.target.files)} />
            <div className="dropzone-icon">
              <span className="msymbol lg" style={{ color: "var(--sage)" }}>add_a_photo</span>
            </div>
            <div className="dropzone-title">Tarik foto ke sini atau klik untuk memilih</div>
            <div className="dropzone-sub">Maks 10 foto · JPG, PNG · Maks 10mb per file</div>
          </div>
          {photos.length > 0 && (
            <div className="photo-grid">
              {photos.map((p, i) => (
                <div key={i} className="photo-thumb" onClick={() => setLightbox({ url: p.dataUrl, idx: i })}>
                  <img src={p.dataUrl} alt={`foto-${i + 1}`} />
                  <button className="photo-thumb-remove" type="button" onClick={e => { e.stopPropagation(); removePhoto(i); }}>
                    <span className="msymbol sm">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button className="btn-primary" onClick={handleSubmit}>
          <span className="msymbol sm filled">send</span>
          Kirim Laporan Foto
        </button>
        <p style={{ textAlign: "center", fontSize: 12, color: "var(--gray)", marginTop: 10 }}>
          Pastikan data yang Anda masukkan sudah benar sebelum mengirim.
        </p>
      </div>

      <div className={`toast${toastVisible ? " show" : ""}`}>{toastMsg}</div>
    </div>
  );
}

// ─── APIP PORTAL ─────────────────────────────────────────────────────────────
function ApipPortal({ onBack }: { onBack: () => void }) {
  const [authed, setAuthed] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginInput, setLoginInput] = useState("");
  const [jenis, setJenis] = useState("");
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().split("T")[0]);
  const [expandedDesa, setExpandedDesa] = useState<string | null>(null);
  // selectedPhotos sekarang menyimpan DrivePhoto, bukan string
  const [selectedPhotos, setSelectedPhotos] = useState<Record<string, DrivePhoto | null>>({});
  const [fetchStatus, setFetchStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [fetchError, setFetchError] = useState("");
  const [driveData, setDriveData] = useState<Record<string, DrivePhoto[]>>({});
  const [generating, setGenerating] = useState(false);
  const [lightbox, setLightbox] = useState<{ photo: DrivePhoto; desa: string } | null>(null);
  const { msg: toastMsg, visible: toastVisible, show: showToast } = useToast();

  const selectedCount = Object.keys(selectedPhotos).filter(d => selectedPhotos[d]).length;

  // ✅ FIXED: Fetch foto langsung dari Google Drive via Apps Script
  const fetchPhotos = useCallback(async () => {
    if (!jenis || !tanggal) return;
    setFetchStatus("loading");
    setFetchError("");
    setDriveData({});
    setSelectedPhotos({});

    try {
      const url = `${APPS_SCRIPT_URL}?action=getStatusSemua&jenis=${encodeURIComponent(jenis)}&tanggal=${encodeURIComponent(tanggal)}`;
      const resp = await fetch(url);
      const data = await resp.json();

      if (data.success && data.status) {
        // data.status = { "Desa X": [{fileId, filename}, ...], ... }
        const newData: Record<string, DrivePhoto[]> = {};
        Object.entries(data.status).forEach(([desa, files]) => {
          newData[desa] = (files as { fileId: string; filename: string }[]).map(f => ({
            fileId: f.fileId,
            filename: f.filename,
            url: `https://drive.google.com/thumbnail?id=${f.fileId}&sz=w600`,
          }));
        });
        setDriveData(newData);
        setFetchStatus("done");
      } else {
        setDriveData({});
        setFetchStatus("done");
      }
    } catch (e) {
      setFetchError("Gagal mengambil data dari server. Periksa koneksi internet.");
      setFetchStatus("error");
    }
  }, [jenis, tanggal]);

  useEffect(() => {
    if (jenis && tanggal) fetchPhotos();
  }, [jenis, tanggal, fetchPhotos]);

  const desasWithPhotos = DESAS.filter(d => (driveData[d] || []).length > 0);

  const selectPhoto = (desa: string, photo: DrivePhoto) => {
    setSelectedPhotos(p => ({ ...p, [desa]: p[desa]?.fileId === photo.fileId ? null : photo }));
  };

  const handleGenerate = async () => {
    if (!jenis || !tanggal) { showToast("Pilih jenis kegiatan dan tanggal terlebih dahulu"); return; }
    if (selectedCount === 0) { showToast("Pilih minimal 1 foto dari 1 desa"); return; }
    setGenerating(true);
    showToast("Mengunduh foto & membuat laporan...");
    try {
      await generateDocx(jenis, tanggal, selectedPhotos);
      showToast("Laporan berhasil diunduh!");
    } catch (e) {
      showToast("Gagal generate: " + (e as Error).message);
    }
    setGenerating(false);
  };

  if (!authed) {
    return (
      <div className="app-shell">
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
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div className="status-card scale-in" style={{ maxWidth: 380, width: "100%" }}>
            <div className="status-icon" style={{ background: "rgba(233,196,106,0.15)", border: "2px solid var(--gold)" }}>
              <span className="msymbol xl" style={{ color: "var(--gold)" }}>lock</span>
            </div>
            <div className="status-title" style={{ marginBottom: 6 }}>Portal APIP</div>
            <div className="status-sub" style={{ marginBottom: 24 }}>Masukkan password untuk mengakses portal pengawas internal.</div>
            <div className="field-group" style={{ marginBottom: 16 }}>
              <label className="field-label">Password</label>
              <input
                type="password" className="field-input" placeholder="••••••••••••"
                value={loginInput}
                onChange={e => { setLoginInput(e.target.value); setLoginError(""); }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    const user = APIP_USERS.find(u => u.password === loginInput);
                    if (user) setAuthed(true); else setLoginError("Password salah. Silakan coba lagi.");
                  }
                }}
              />
              {loginError && <div style={{ fontSize: 12, color: "var(--red)", marginTop: 6, fontWeight: 600 }}>⚠️ {loginError}</div>}
            </div>
            <button className="btn-primary btn-gold" onClick={() => {
              const user = APIP_USERS.find(u => u.password === loginInput);
              if (user) setAuthed(true); else setLoginError("Password salah. Silakan coba lagi.");
            }}>
              <span className="msymbol sm">login</span> Masuk Portal APIP
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {lightbox && (
        <Lightbox
          src={lightbox.photo.url}
          caption={`${lightbox.desa} · ${lightbox.photo.filename}`}
          isChosen={selectedPhotos[lightbox.desa]?.fileId === lightbox.photo.fileId}
          onClose={() => setLightbox(null)}
          onToggleChoose={() => selectPhoto(lightbox.desa, lightbox.photo)}
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
            <span className="msymbol sm">assignment</span> Pengawas Internal
          </div>
          <h2 className="page-header-title">Portal APIP</h2>
          <p className="page-header-sub">Pilih foto terbaik dari setiap desa, lalu generate laporan rekap.</p>
        </div>

        <div className="form-card">
          <div className="form-section-title"><span className="msymbol sm">filter_list</span> Filter Data</div>
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

          {/* Status fetch */}
          {fetchStatus === "loading" && (
            <div className="fetch-status loading">
              <div className="fetch-spin" />
              Mengambil data foto dari Google Drive...
            </div>
          )}
          {fetchStatus === "error" && (
            <div className="fetch-status error">
              <span className="msymbol sm">error</span>
              {fetchError}
              <button className="refresh-btn" onClick={fetchPhotos}>
                <span className="msymbol sm">refresh</span> Coba lagi
              </button>
            </div>
          )}
          {fetchStatus === "done" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "var(--moss)", fontWeight: 600 }}>
                ✅ Data berhasil dimuat — {desasWithPhotos.length} desa ada foto
              </span>
              <button className="refresh-btn" onClick={fetchPhotos}>
                <span className="msymbol sm">refresh</span> Refresh
              </button>
            </div>
          )}
        </div>

        {jenis && tanggal && fetchStatus === "done" && (
          <div className="apip-stats fade-up">
            <div className="stat-card"><div className="stat-value">{DESAS.length}</div><div className="stat-label">Total Desa</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--moss)" }}>{desasWithPhotos.length}</div><div className="stat-label">Ada Foto</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color: "#b58a00" }}>{selectedCount}</div><div className="stat-label">Terpilih</div></div>
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

        {jenis && tanggal && fetchStatus === "done" ? (
          <div style={{ marginBottom: 100 }}>
            <div className="form-section-title" style={{ marginBottom: 14 }}>
              <span className="msymbol sm">location_on</span> Daftar Desa / Kelurahan
            </div>
            {DESAS.map((d, i) => {
              const photos = driveData[d] || [];
              const hasPhotos = photos.length > 0;
              const chosen = selectedPhotos[d];
              const isOpen = expandedDesa === d;
              return (
                <div key={d} className={`desa-card${hasPhotos ? " has-upload" : ""}${chosen ? " selected" : ""}`}>
                  <div className="desa-card-header" onClick={() => setExpandedDesa(isOpen ? null : d)}>
                    <div className={`desa-number${chosen ? " done" : ""}`}>
                      {chosen ? <span className="msymbol sm filled">check</span> : i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="desa-name">{d}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, color: "var(--forest)", fontWeight: 600 }}>👤 {PIC_DATA[d]?.nama || "-"}</span>
                        {PIC_DATA[d]?.hp && (
                          <a href={`https://wa.me/62${PIC_DATA[d].hp.replace(/^0/, "")}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "#25D366", background: "#f0fff4", border: "1px solid #b7e4c7", borderRadius: 100, padding: "2px 10px", textDecoration: "none" }}>
                            📱 {PIC_DATA[d].hp}
                          </a>
                        )}
                      </div>
                      <div style={{ fontSize: 12, marginTop: 2, fontWeight: 500, color: hasPhotos ? "var(--moss)" : "#e63946" }}>
                        {hasPhotos ? `✅ ${photos.length} foto tersedia` : "⏳ Belum upload — segera hubungi PIC"}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {!hasPhotos && <span className="desa-badge badge-none"><span className="msymbol sm">hourglass_empty</span> Menunggu</span>}
                      {hasPhotos && !chosen && <span className="desa-badge badge-upload"><span className="msymbol sm">photo_library</span> Ada Foto</span>}
                      {chosen && <span className="desa-badge badge-selected"><span className="msymbol sm filled">star</span> Terpilih</span>}
                      {hasPhotos && <span className="msymbol" style={{ color: "var(--gray)", transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.25s" }}>expand_more</span>}
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
                              Klik foto untuk <strong>memperbesar &amp; memilih</strong>. Foto bertanda bintang akan masuk ke laporan.
                            </p>
                            <div className="apip-photo-grid">
                              {photos.map((photo, pi) => (
                                <div
                                  key={photo.fileId}
                                  className={`apip-photo-thumb${chosen?.fileId === photo.fileId ? " chosen" : ""}`}
                                  onClick={() => setLightbox({ photo, desa: d })}
                                >
                                  {/* ✅ Gunakan Google Drive thumbnail langsung */}
                                  <DriveImage fileId={photo.fileId} alt={`foto-${pi + 1}`} />
                                  {chosen?.fileId === photo.fileId && (
                                    <div className="chosen-badge">
                                      <div className="chosen-check">
                                        <span className="msymbol sm filled" style={{ color: "var(--forest)" }}>check</span>
                                      </div>
                                    </div>
                                  )}
                                  <div className="zoom-hint"><span className="msymbol sm">zoom_in</span></div>
                                </div>
                              ))}
                            </div>
                            {chosen && (
                              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--moss)", fontWeight: 600 }}>
                                <span className="msymbol sm filled" style={{ color: "var(--gold)" }}>star</span>
                                Foto terpilih untuk laporan rekap
                                <button style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--red)", fontSize: 12, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 4, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                                  onClick={() => selectPhoto(d, chosen)}>
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
        ) : fetchStatus !== "loading" && (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--gray)" }}>
            <span className="msymbol xl" style={{ color: "var(--border)", display: "block", marginBottom: 16 }}>filter_list</span>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--pine)", marginBottom: 8 }}>Pilih Filter Terlebih Dahulu</div>
            <div style={{ fontSize: 14 }}>Pilih jenis kegiatan dan tanggal untuk melihat foto dari semua desa</div>
          </div>
        )}
      </div>

      {jenis && tanggal && fetchStatus === "done" && (
        <div className="generate-panel">
          <div className="gen-inner">
            <div className="gen-progress-text">
              <div className="gen-count">{selectedCount}<span style={{ fontSize: 14, fontWeight: 400, color: "var(--gray)" }}>/{DESAS.length}</span></div>
              <div className="gen-sub">desa sudah dipilih fotonya</div>
            </div>
            <button className="gen-btn" onClick={handleGenerate} disabled={selectedCount === 0 || generating}>
              {generating ? (
                <><div style={{ width: 16, height: 16, border: "2px solid var(--forest)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />Membuat...</>
              ) : (
                <><span className="msymbol sm filled">download</span>Download .docx</>
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
  const [role, setRole] = useState<string | null>(null);
  return (
    <>
      <style>{css}</style>
      {role === null && <RoleSelector onSelect={setRole} />}
      {role === "pic" && <DesaPortal onBack={() => setRole(null)} />}
      {role === "apip" && <ApipPortal onBack={() => setRole(null)} />}
    </>
  );
}
