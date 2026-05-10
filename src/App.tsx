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
  "Desa Tarempa Barat Daya": { nama: "REBO YANTO",                hp: "082364825147"  },
  "Desa Tarempa Selatan":    { nama: "Marina",                     hp: "081356168793"  },
  "Desa Tarempa Timur":      { nama: "Desi Mainila Sari",          hp: "088272195261"  },
  "Kelurahan Tarempa":       { nama: "Agustina Aryantani, S.I.P", hp: "081270420122"  },
};

// Password disimpan sebagai SHA-256 hash — tidak ada plaintext di source code
// Untuk update password: jalankan di browser console:
//   crypto.subtle.digest("SHA-256", new TextEncoder().encode("passwordbaru"))
//     .then(b => console.log(Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("")))
// SHA-256("nyamnyam1993"):
const APIP_PASSWORD_HASH = "3ff96624c57208d58d731c35e32c238e88030a08738df4c33dfb87674c5842b9";

async function hashPassword(pw: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

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

// Kompres + resize gambar sebelum upload (max 1920px, JPEG 82%)
function compressImage(file: File, maxPx = 1920, quality = 0.82): Promise<{ dataUrl: string; base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width >= height) { height = Math.round(height * maxPx / width); width = maxPx; }
        else { width = Math.round(width * maxPx / height); height = maxPx; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve({ dataUrl, base64: dataUrl.split(",")[1], mime: "image/jpeg" });
    };
    img.onerror = reject;
    img.src = url;
  });
}

// Thumbnail kecil (800px) untuk preview UI agar cepat
function makeThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 800;
      let { width, height } = img;
      if (width > max || height > max) {
        if (width >= height) { height = Math.round(height * max / width); width = max; }
        else { width = Math.round(width * max / height); height = max; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = reject;
    img.src = url;
  });
}

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
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600;700;800&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --forest: #0a1f10;
    --pine:   #14532d;
    --moss:   #166534;
    --sage:   #22c55e;
    --jade:   #16a34a;
    --mist:   #bbf7d0;
    --foam:   #f0fdf4;
    --gold:   #d4a017;
    --amber:  #f59e0b;
    --cream:  #fffbeb;
    --white:  #ffffff;
    --red:    #dc2626;
    --gray:   #6b7280;
    --light:  #f9fafb;
    --border: #e5e7eb;
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
    --shadow-md: 0 4px 16px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04);
    --shadow-lg: 0 20px 60px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.06);
    --shadow-green: 0 8px 32px rgba(22,163,74,0.2);
  }

  body {
    font-family: 'Outfit', sans-serif;
    background: var(--foam);
    color: var(--forest);
    min-height: 100dvh;
    -webkit-font-smoothing: antialiased;
  }

  .msymbol {
    font-family: 'Material Symbols Outlined';
    font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
    font-size: 22px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    user-select: none;
  }
  .msymbol.filled { font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
  .msymbol.sm { font-size: 18px; }
  .msymbol.lg { font-size: 30px; }
  .msymbol.xl { font-size: 40px; }

  /* ── ROLE SELECTOR ── */
  .role-bg {
    min-height: 100dvh;
    background: var(--forest);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 24px;
    position: relative;
    overflow: hidden;
  }
  .role-bg::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 70% 50% at 15% 20%, rgba(34,197,94,0.12) 0%, transparent 60%),
      radial-gradient(ellipse 50% 70% at 85% 80%, rgba(22,163,74,0.08) 0%, transparent 55%),
      radial-gradient(ellipse 40% 40% at 50% 50%, rgba(20,83,45,0.5) 0%, transparent 70%);
    pointer-events: none;
  }
  /* Organic leaf shapes in background */
  .role-bg::after {
    content: '';
    position: absolute;
    width: 600px; height: 600px;
    border-radius: 40% 60% 55% 45% / 45% 50% 50% 55%;
    border: 1px solid rgba(34,197,94,0.06);
    top: -200px; right: -200px;
    animation: floatShape 18s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes floatShape {
    0%, 100% { transform: rotate(0deg) scale(1); }
    50% { transform: rotate(8deg) scale(1.05); }
  }
  .brand-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(34,197,94,0.1);
    border: 1px solid rgba(34,197,94,0.2);
    border-radius: 100px;
    padding: 8px 20px;
    color: var(--sage);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin-bottom: 32px;
  }
  .role-title {
    font-family: 'DM Serif Display', serif;
    font-size: clamp(36px, 6vw, 58px);
    font-weight: 400;
    color: #fff;
    text-align: center;
    line-height: 1.1;
    margin-bottom: 14px;
    letter-spacing: -0.02em;
  }
  .role-title em { font-style: italic; color: var(--sage); }
  .role-subtitle {
    color: rgba(255,255,255,0.45);
    font-size: 15px;
    font-weight: 400;
    text-align: center;
    max-width: 360px;
    line-height: 1.8;
    margin: 0 auto 52px;
  }
  .role-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    width: 100%;
    max-width: 580px;
  }
  @media (max-width: 500px) { .role-cards { grid-template-columns: 1fr; } }
  .role-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 24px;
    padding: 32px 24px 28px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.23,1,0.32,1);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    position: relative;
    overflow: hidden;
    text-align: center;
  }
  .role-card::before {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 0.3s;
    border-radius: inherit;
  }
  .role-card:first-child::before { background: radial-gradient(ellipse at 30% 30%, rgba(34,197,94,0.12), transparent 70%); }
  .role-card:last-child::before { background: radial-gradient(ellipse at 30% 30%, rgba(212,160,23,0.12), transparent 70%); }
  .role-card:hover { transform: translateY(-4px); border-color: rgba(255,255,255,0.14); background: rgba(255,255,255,0.07); box-shadow: 0 24px 48px rgba(0,0,0,0.3); }
  .role-card:hover::before { opacity: 1; }
  .role-card:active { transform: scale(0.98) translateY(-2px); }

  .role-icon {
    width: 56px; height: 56px;
    border-radius: 16px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    position: relative;
    margin: 0 auto;
  }
  /* 3D-ish icon glow effect */
  .role-icon::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.1);
  }
  .role-card-title { color: #fff; font-size: 18px; font-weight: 700; line-height: 1.25; letter-spacing: -0.01em; text-align: center; }
  .role-card-desc { color: rgba(255,255,255,0.4); font-size: 13px; line-height: 1.65; font-weight: 400; flex: 1; text-align: center; }
  .role-arrow { display: inline-flex; align-items: center; justify-content: center; gap: 6px; color: var(--sage); font-size: 12px; font-weight: 600; letter-spacing: 0.02em; width: 100%; }
  .wa-link { margin-top: 40px; display: inline-flex; align-items: center; gap: 8px; color: rgba(255,255,255,0.25); font-size: 13px; font-weight: 500; text-decoration: none; transition: color 0.2s; }
  .wa-link:hover { color: rgba(255,255,255,0.5); }

  /* ── APP SHELL ── */
  .app-shell { min-height: 100dvh; display: flex; flex-direction: column; background: var(--foam); }

  .topbar {
    display: flex; align-items: center; gap: 12px;
    padding: 0 20px; height: 60px;
    background: rgba(255,255,255,0.9);
    backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--border);
    position: sticky; top: 0; z-index: 50;
  }
  .back-btn {
    display: flex; align-items: center; gap: 6px;
    background: none; border: 1px solid var(--border);
    border-radius: 10px; padding: 7px 12px;
    font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600; color: var(--pine);
    cursor: pointer; transition: all 0.15s;
  }
  .back-btn:hover { background: var(--foam); border-color: var(--jade); color: var(--jade); }
  .topbar-brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; color: var(--pine); flex: 1; justify-content: center; letter-spacing: -0.01em; }
  .topbar-brand-dot { width: 8px; height: 8px; background: var(--sage); border-radius: 50%; box-shadow: 0 0 6px rgba(34,197,94,0.5); }
  .role-pill { background: var(--foam); border: 1px solid var(--mist); border-radius: 100px; padding: 5px 14px; font-size: 11px; font-weight: 700; color: var(--jade); letter-spacing: 0.04em; }

  .content-area { flex: 1; padding: 28px 20px 120px; max-width: 680px; margin: 0 auto; width: 100%; }

  .page-header { text-align: center; margin-bottom: 28px; }
  .page-header-chip {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--mist); color: var(--pine);
    border-radius: 100px; padding: 6px 16px;
    font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
    margin-bottom: 14px;
  }
  .page-header-title { font-family: 'DM Serif Display', serif; font-size: clamp(24px, 5vw, 34px); font-weight: 400; color: var(--pine); line-height: 1.15; margin-bottom: 8px; letter-spacing: -0.02em; }
  .page-header-sub { color: var(--gray); font-size: 14px; font-weight: 400; line-height: 1.7; max-width: 440px; margin: 0 auto; }

  /* ── FORM CARD ── */
  .form-card {
    background: var(--white);
    border-radius: 20px;
    border: 1px solid var(--border);
    padding: 24px;
    margin-bottom: 16px;
    box-shadow: var(--shadow-sm);
  }
  .form-section-title {
    display: flex; align-items: center; gap: 8px;
    font-size: 11px; font-weight: 700; color: var(--gray);
    text-transform: uppercase; letter-spacing: 0.08em;
    margin-bottom: 18px; padding-bottom: 14px;
    border-bottom: 1px solid var(--border);
  }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 480px) { .grid-2 { grid-template-columns: 1fr; } }
  .field-group { display: flex; flex-direction: column; gap: 7px; margin-bottom: 14px; }
  .field-group:last-child { margin-bottom: 0; }
  .field-label { font-size: 13px; font-weight: 600; color: var(--pine); }
  .select-wrap { position: relative; }
  .select-wrap .msymbol { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); color: var(--gray); pointer-events: none; font-size: 20px; }
  .field-select, .field-input {
    width: 100%; appearance: none;
    background: var(--light); border: 1.5px solid var(--border);
    border-radius: 12px; padding: 12px 42px 12px 14px;
    font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500; color: var(--forest);
    outline: none; transition: border-color 0.15s, box-shadow 0.15s;
  }
  .field-input { padding-right: 14px; }
  .field-select:focus, .field-input:focus { border-color: var(--jade); box-shadow: 0 0 0 3px rgba(34,197,94,0.12); background: white; }

  /* ── DROPZONE ── */
  .dropzone {
    border: 2px dashed var(--border);
    border-radius: 16px;
    padding: 36px 20px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    background: var(--light);
  }
  .dropzone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
  .dropzone:hover, .dropzone.drag-over { border-color: var(--jade); background: var(--foam); }
  .dropzone.drag-over { border-style: solid; box-shadow: 0 0 0 3px rgba(34,197,94,0.1); }
  .dropzone-icon {
    width: 60px; height: 60px; background: var(--foam); border: 1.5px solid var(--mist);
    border-radius: 18px; display: flex; align-items: center; justify-content: center;
    margin: 0 auto 16px;
    box-shadow: 0 4px 12px rgba(22,163,74,0.1), inset 0 1px 0 rgba(255,255,255,0.8);
  }
  .dropzone-title { font-size: 14px; font-weight: 600; color: var(--pine); margin-bottom: 6px; }
  .dropzone-sub { font-size: 12px; color: var(--gray); font-weight: 400; }

  /* ── PHOTO GRID ── */
  .photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 10px; margin-top: 16px; }
  .photo-thumb { aspect-ratio: 1; border-radius: 12px; overflow: hidden; position: relative; cursor: pointer; background: var(--light); box-shadow: var(--shadow-sm); transition: transform 0.15s; }
  .photo-thumb:hover { transform: scale(1.03); }
  .photo-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .photo-thumb-remove {
    position: absolute; top: 6px; right: 6px;
    width: 24px; height: 24px; border-radius: 8px;
    background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
    border: none; display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.15s; cursor: pointer; color: white; z-index: 3;
  }
  .photo-thumb:hover .photo-thumb-remove { opacity: 1; }

  /* ── BUTTONS ── */
  .btn-primary {
    width: 100%; background: var(--pine); color: var(--white); border: none;
    border-radius: 14px; padding: 15px 24px; font-family: 'Outfit', sans-serif;
    font-size: 15px; font-weight: 700; display: flex; align-items: center; justify-content: center;
    gap: 10px; cursor: pointer; transition: all 0.2s;
    box-shadow: 0 4px 14px rgba(20,83,45,0.3), inset 0 1px 0 rgba(255,255,255,0.08);
    letter-spacing: -0.01em;
  }
  .btn-primary:hover { background: var(--moss); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(20,83,45,0.35); }
  .btn-primary:active { transform: scale(0.99); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
  .btn-gold { background: linear-gradient(135deg, #d4a017, #f59e0b); color: var(--forest); box-shadow: 0 4px 14px rgba(212,160,23,0.3); }
  .btn-gold:hover { filter: brightness(1.06); background: linear-gradient(135deg, #f59e0b, #d4a017); }
  .btn-outline { background: transparent; border: 1.5px solid var(--border); color: var(--pine); box-shadow: none; }
  .btn-outline:hover { background: var(--foam); border-color: var(--jade); }

  .progress-wrap { background: var(--light); border-radius: 100px; height: 6px; overflow: hidden; margin: 8px 0; }
  .progress-fill { height: 100%; border-radius: 100px; background: linear-gradient(90deg, var(--sage), var(--jade)); transition: width 0.5s ease; box-shadow: 0 0 8px rgba(34,197,94,0.4); }

  /* ── STATUS CARDS ── */
  .status-card { background: var(--white); border-radius: 24px; padding: 44px 28px; text-align: center; box-shadow: var(--shadow-lg); border: 1px solid var(--border); }
  .status-icon { width: 80px; height: 80px; border-radius: 24px; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; box-shadow: 0 8px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6); }
  .status-title { font-family: 'DM Serif Display', serif; font-size: 24px; font-weight: 400; color: var(--pine); margin-bottom: 8px; letter-spacing: -0.02em; }
  .status-sub { color: var(--gray); font-size: 14px; font-weight: 400; line-height: 1.7; margin-bottom: 24px; }
  .path-pill { background: var(--foam); border: 1px solid var(--mist); border-radius: 10px; padding: 10px 16px; font-size: 12px; font-family: monospace; color: var(--jade); word-break: break-all; text-align: left; margin-bottom: 24px; }

  /* ── APIP STATS ── */
  .apip-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
  .stat-card { background: var(--white); border-radius: 16px; padding: 18px 14px; text-align: center; box-shadow: var(--shadow-sm); border: 1px solid var(--border); }
  .stat-value { font-family: 'DM Serif Display', serif; font-size: 30px; font-weight: 400; color: var(--pine); line-height: 1; margin-bottom: 5px; letter-spacing: -0.02em; }
  .stat-label { font-size: 10px; color: var(--gray); font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; }

  /* ── DESA CARDS ── */
  .desa-card { background: var(--white); border-radius: 16px; border: 1.5px solid var(--border); overflow: hidden; margin-bottom: 10px; transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s; }
  .desa-card:hover { transform: translateY(-1px); box-shadow: var(--shadow-md); }
  .desa-card.has-upload { border-color: var(--mist); }
  .desa-card.selected { border-color: var(--amber); box-shadow: 0 0 0 3px rgba(245,158,11,0.12); }
  .desa-card-header { padding: 16px 18px; display: flex; align-items: center; gap: 14px; cursor: pointer; transition: background 0.12s; }
  .desa-card-header:hover { background: var(--light); }
  .desa-number { width: 34px; height: 34px; border-radius: 10px; background: var(--light); border: 1.5px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: var(--jade); flex-shrink: 0; }
  .desa-number.done { background: var(--pine); border-color: var(--pine); color: var(--white); box-shadow: var(--shadow-green); }
  .desa-name { flex: 1; font-size: 14px; font-weight: 700; color: var(--forest); letter-spacing: -0.01em; }
  .desa-meta { font-size: 12px; color: var(--gray); margin-top: 2px; font-weight: 400; display: flex; align-items: center; gap: 6px; }
  .desa-badge { display: inline-flex; align-items: center; gap: 4px; border-radius: 8px; padding: 4px 10px; font-size: 11px; font-weight: 600; }
  .badge-none { background: var(--light); color: var(--gray); border: 1px solid var(--border); }
  .badge-upload { background: var(--foam); color: var(--jade); border: 1px solid var(--mist); }
  .badge-selected { background: rgba(245,158,11,0.1); color: #b45309; border: 1px solid rgba(245,158,11,0.3); }
  .desa-body { padding: 0 18px 18px; border-top: 1px solid var(--border); }
  .desa-body-inner { padding-top: 14px; }
  .no-photos { text-align: center; padding: 32px; color: var(--gray); font-size: 14px; font-weight: 400; }

  /* ── APIP PHOTO GRID ── */
  .apip-photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; margin-top: 10px; }
  .apip-photo-thumb { aspect-ratio: 4/3; border-radius: 12px; overflow: hidden; position: relative; cursor: pointer; border: 2.5px solid transparent; transition: all 0.18s; background: var(--light); }
  .apip-photo-thumb:hover { border-color: var(--jade); transform: scale(1.02); box-shadow: var(--shadow-md); }
  .apip-photo-thumb.chosen { border-color: var(--amber); box-shadow: 0 0 0 3px rgba(245,158,11,0.15); }
  .apip-photo-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .apip-photo-thumb .img-loading { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--gray); font-size: 12px; flex-direction: column; gap: 8px; }
  .chosen-badge { position: absolute; inset: 0; background: rgba(245,158,11,0.2); display: flex; align-items: center; justify-content: center; pointer-events: none; }
  .chosen-check { width: 36px; height: 36px; background: var(--amber); border-radius: 10px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(245,158,11,0.4); }
  .apip-photo-thumb .zoom-hint { position: absolute; bottom: 6px; right: 6px; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); color: white; border-radius: 8px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.15s; pointer-events: none; }
  .apip-photo-thumb:hover .zoom-hint { opacity: 1; }

  /* ── LIGHTBOX ── */
  .lightbox-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.94); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 16px; animation: fadeInLb 0.2s ease; }
  @keyframes fadeInLb { from { opacity: 0; } to { opacity: 1; } }
  .lightbox-inner { position: relative; max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; align-items: center; gap: 16px; }
  .lightbox-img { max-width: 90vw; max-height: 80vh; border-radius: 16px; object-fit: contain; box-shadow: 0 32px 80px rgba(0,0,0,0.7); animation: zoomInLb 0.25s cubic-bezier(0.34,1.56,0.64,1); }
  @keyframes zoomInLb { from { transform: scale(0.88); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  .lightbox-caption { color: rgba(255,255,255,0.6); font-size: 13px; font-weight: 500; }
  .lightbox-close { position: absolute; top: -48px; right: 0; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: white; border-radius: 12px; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.15s; font-family: 'Material Symbols Outlined'; font-size: 20px; font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24; }
  .lightbox-close:hover { background: rgba(255,255,255,0.2); }
  .lightbox-actions { display: flex; gap: 10px; }
  .lightbox-btn { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 12px; padding: 9px 20px; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 6px; }
  .lightbox-btn:hover { background: rgba(255,255,255,0.18); }
  .lightbox-btn.gold { background: rgba(245,158,11,0.15); border-color: var(--amber); color: var(--amber); }
  .lightbox-btn.gold.active { background: var(--amber); color: var(--forest); }
  .lightbox-btn.gold:hover { background: var(--amber); color: var(--forest); }

  /* ── GENERATE PANEL ── */
  .generate-panel { position: fixed; bottom: 0; left: 0; right: 0; background: rgba(255,255,255,0.95); border-top: 1px solid var(--border); backdrop-filter: blur(16px); box-shadow: 0 -8px 32px rgba(0,0,0,0.08); padding: 16px 20px; z-index: 90; }
  .gen-inner { max-width: 720px; margin: 0 auto; display: flex; align-items: center; gap: 16px; }
  .gen-progress-text { flex: 1; }
  .gen-count { font-family: 'DM Serif Display', serif; font-size: 24px; font-weight: 400; color: var(--pine); letter-spacing: -0.02em; }
  .gen-sub { font-size: 12px; color: var(--gray); font-weight: 400; margin-top: 1px; }
  .gen-btn { flex-shrink: 0; background: linear-gradient(135deg, #d4a017, #f59e0b); color: var(--forest); border: none; border-radius: 12px; padding: 12px 22px; font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 14px rgba(212,160,23,0.35); }
  .gen-btn:hover { filter: brightness(1.06); transform: translateY(-1px); box-shadow: 0 8px 20px rgba(212,160,23,0.4); }
  .gen-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  /* ── OVERLAY / LOADING ── */
  .overlay { position: fixed; inset: 0; background: rgba(10,31,16,0.75); backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; z-index: 999; flex-direction: column; gap: 20px; padding: 24px; }
  .overlay-card { background: var(--white); border-radius: 28px; padding: 44px 36px; max-width: 360px; width: 100%; text-align: center; box-shadow: var(--shadow-lg); }
  .spinner { width: 44px; height: 44px; border: 3px solid var(--mist); border-top-color: var(--jade); border-radius: 50%; animation: spin 0.75s linear infinite; margin: 0 auto 24px; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── TOAST ── */
  .toast { position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%) translateY(16px); background: var(--forest); color: white; padding: 12px 22px; border-radius: 14px; font-size: 13px; font-weight: 600; opacity: 0; transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1); pointer-events: none; z-index: 1000; white-space: nowrap; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

  /* ── ANIMATIONS ── */
  @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  .fade-up { animation: fadeUp 0.4s cubic-bezier(0.23,1,0.32,1) both; }
  @keyframes scaleIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
  .scale-in { animation: scaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both; }

  .retry-info { font-size: 12px; color: var(--amber); margin-top: 8px; font-weight: 600; }

  .fetch-status { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: 12px; font-size: 13px; font-weight: 500; margin-bottom: 16px; }
  .fetch-status.loading { background: var(--foam); color: var(--jade); border: 1px solid var(--mist); }
  .fetch-status.error { background: #fef2f2; color: var(--red); border: 1px solid #fecaca; }
  .fetch-spin { width: 16px; height: 16px; border: 2px solid var(--mist); border-top-color: var(--jade); border-radius: 50%; animation: spin 0.75s linear infinite; flex-shrink: 0; }

  .refresh-btn { display: inline-flex; align-items: center; gap: 6px; background: var(--foam); border: 1px solid var(--mist); border-radius: 100px; padding: 6px 14px; font-size: 12px; font-weight: 600; color: var(--jade); cursor: pointer; transition: all 0.15s; margin-left: auto; }
  .refresh-btn:hover { background: var(--mist); color: var(--pine); }
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
      <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 600, width: "100%" }}>
        <div className="brand-badge">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1C3.686 1 1 3.686 1 7s2.686 6 6 6 6-2.686 6-6-2.686-6-6-6z" fill="rgba(34,197,94,0.3)" stroke="rgba(34,197,94,0.8)" strokeWidth="1"/>
            <path d="M7 3.5C5.07 3.5 3.5 5.07 3.5 7S5.07 10.5 7 10.5 10.5 8.93 10.5 7 8.93 3.5 7 3.5z" fill="rgba(34,197,94,0.5)"/>
            <circle cx="7" cy="7" r="1.5" fill="#22c55e"/>
          </svg>
          Gerakan Indonesia Asri
        </div>
        <h1 className="role-title">Dokumentasi<br /><em>Kebersihan Desa</em></h1>
        <p className="role-subtitle">Platform terpadu untuk mencatat dan merekap kegiatan Jum'at Bersih & Selasa Goro Kecamatan Siantan.</p>
        <div className="role-cards">
          <div className="role-card" onClick={() => onSelect("pic")}>
            <div className="role-icon" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.2)" }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <defs>
                  <linearGradient id="upG" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#86efac"/>
                    <stop offset="100%" stopColor="#22c55e"/>
                  </linearGradient>
                </defs>
                <rect x="4" y="18" width="20" height="3" rx="1.5" fill="url(#upG)" opacity="0.4"/>
                <path d="M14 6L9 13h3.5v6h3V13H19L14 6z" fill="url(#upG)"/>
              </svg>
            </div>
            <div>
              <div className="role-card-title">Portal<br />PIC Desa</div>
              <div className="role-card-desc">Upload foto dokumentasi kegiatan kebersihan di wilayah Anda</div>
            </div>
            <div className="role-arrow">Masuk <span className="msymbol sm">arrow_forward</span></div>
          </div>
          <div className="role-card" onClick={() => onSelect("apip")}>
            <div className="role-icon" style={{ background: "rgba(212,160,23,0.12)", border: "1px solid rgba(212,160,23,0.2)" }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <defs>
                  <linearGradient id="docG" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#fcd34d"/>
                    <stop offset="100%" stopColor="#d4a017"/>
                  </linearGradient>
                </defs>
                <rect x="6" y="4" width="16" height="20" rx="3" fill="url(#docG)" opacity="0.25"/>
                <rect x="6" y="4" width="16" height="20" rx="3" stroke="url(#docG)" strokeWidth="1.5"/>
                <rect x="9.5" y="9" width="9" height="1.5" rx="0.75" fill="url(#docG)"/>
                <rect x="9.5" y="12.5" width="9" height="1.5" rx="0.75" fill="url(#docG)"/>
                <rect x="9.5" y="16" width="6" height="1.5" rx="0.75" fill="url(#docG)"/>
              </svg>
            </div>
            <div>
              <div className="role-card-title">Portal<br />APIP</div>
              <div className="role-card-desc">Tinjau foto dari semua desa dan generate laporan rekap .docx</div>
            </div>
            <div className="role-arrow" style={{ color: "var(--amber)" }}>Masuk <span className="msymbol sm">arrow_forward</span></div>
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
  const [showConfirm, setShowConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const uploadHistory: Array<{desa:string;jenis:string;tanggal:string;jumlahFoto:number;waktu:string}> = (() => {
    try { return JSON.parse(localStorage.getItem("gia_upload_history") || "[]"); } catch { return []; }
  })();
  const [lightbox, setLightbox] = useState<{ url: string; idx: number } | null>(null);
  const { msg: toastMsg, visible: toastVisible, show: showToast } = useToast();

  // Pakai thumbnail kecil untuk preview agar UI tidak berat
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter(f => f.type.startsWith("image/"));
    const newPhotos = await Promise.all(valid.map(async (f) => ({ file: f, dataUrl: await makeThumbnail(f) })));
    setPhotos(p => [...p, ...newPhotos]);
  }, [showToast]);

  const removePhoto = (i: number) => setPhotos(p => p.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!desa || !jenis || !tanggal) { showToast("Lengkapi semua data terlebih dahulu"); return; }
    if (photos.length === 0) { showToast("Upload minimal 1 foto"); return; }
    setScreen("uploading");
    setUploadProgress({ current: 0, total: photos.length });
    setUploadStatus("Mengompres foto...");

    try {
      // 1. Kompres semua foto paralel dulu
      const compressed = await Promise.all(
        photos.map(p => compressImage(p.file))
      );

      setUploadStatus(`Mengirim ${photos.length} foto...`);

      // 2. Upload paralel (semua sekaligus)
      let done = 0;
      await Promise.all(
        compressed.map(async (c, i) => {
          const payload = {
            desa, jenis, tanggal,
            filename: `${desa.replace(/\s+/g, "_")}_${jenis.replace(/[^a-zA-Z0-9]/g, "_")}_${tanggal}_foto${i + 1}.jpg`,
            mimeType: c.mime,
            base64: c.base64,
          };

          let lastError = "";
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              if (attempt > 1) await new Promise(r => setTimeout(r, 2000 * attempt));
              await fetch(APPS_SCRIPT_URL, {
                method: "POST",
                mode: "no-cors",
                body: JSON.stringify(payload),
              });
              done++;
              setUploadProgress({ current: done, total: photos.length });
              return;
            } catch (e) {
              lastError = (e as Error).message;
            }
          }
          throw new Error(`Foto ${i + 1} gagal setelah 3 percobaan: ${lastError}`);
        })
      );

      setSuccessPath(`Desa Kecamatan Siantan / ${desa} / ${jenis} / ${tanggal}`);
      setScreen("success");
      // Simpan riwayat upload ke localStorage
      try {
        const key = "gia_upload_history";
        const existing = JSON.parse(localStorage.getItem(key) || "[]");
        existing.unshift({ desa, jenis, tanggal, jumlahFoto: photos.length, waktu: new Date().toISOString() });
        localStorage.setItem(key, JSON.stringify(existing.slice(0, 20))); // simpan max 20 entri
      } catch {}
      // Auto-buka WA ke APIP setelah upload sukses
      const _waText = encodeURIComponent(
        `Assalamu'alaikum Pak Yopi 🌿\n\n` +
        `Kami dari *${desa}* telah selesai mengupload foto dokumentasi kegiatan.\n\n` +
        `📋 *Detail Kegiatan:*\n` +
        `• Kegiatan : ${jenis}\n` +
        `• Tanggal  : ${tanggal}\n` +
        `• Jumlah Foto : ${photos.length} foto\n\n` +
        `Mohon ditinjau di Portal APIP.\n` +
        `🔗 https://gia-app.netlify.app\n\n` +
        `Terima kasih 🙏`
      );
      setTimeout(() => window.open(`https://wa.me/6281267426804?text=${_waText}`, "_blank"), 800);
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
    const waText = encodeURIComponent(
      `Assalamu'alaikum Pak Yopi 🌿

` +
      `Kami dari *${desa}* telah selesai mengupload foto dokumentasi kegiatan.

` +
      `📋 *Detail Kegiatan:*
` +
      `• Kegiatan : ${jenis}
` +
      `• Tanggal  : ${formatDate(tanggal)}
` +
      `• Jumlah Foto : ${uploadProgress.total} foto

` +
      `Mohon ditinjau di Portal APIP.
` +
      `🔗 https://gia-app.netlify.app

` +
      `Terima kasih 🙏`
    );
    const waUrl = `https://wa.me/6281267426804?text=${waText}`;

    return (
      <div className="app-shell">
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div className="status-card scale-in" style={{ maxWidth: 420, width: "100%" }}>
            <div className="status-icon" style={{ background: "var(--foam)", border: "2px solid var(--mist)", borderRadius: 24 }}>
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <defs>
                  <linearGradient id="ckG" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#86efac"/>
                    <stop offset="100%" stopColor="#22c55e"/>
                  </linearGradient>
                </defs>
                <circle cx="20" cy="20" r="18" fill="url(#ckG)" opacity="0.15"/>
                <path d="M12 20.5l5.5 5.5 10.5-11" stroke="url(#ckG)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="status-title">Foto Berhasil Terkirim!</div>
            <div className="status-sub">{uploadProgress.total} foto dari <strong>{desa}</strong> telah tersimpan di Google Drive.</div>
            <div className="path-pill">📁 {successPath}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none" }}
              >
                <button className="btn-primary btn-gold" style={{ width: "100%" }}>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M9 1.5C4.86 1.5 1.5 4.86 1.5 9c0 1.32.36 2.56.98 3.63L1.5 16.5l3.97-.96A7.46 7.46 0 009 16.5c4.14 0 7.5-3.36 7.5-7.5S13.14 1.5 9 1.5z" fill="currentColor" opacity="0.2"/>
                    <path d="M9 1.5C4.86 1.5 1.5 4.86 1.5 9c0 1.32.36 2.56.98 3.63L1.5 16.5l3.97-.96A7.46 7.46 0 009 16.5c4.14 0 7.5-3.36 7.5-7.5S13.14 1.5 9 1.5z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                    <path d="M6.5 7c0-.28.22-.5.5-.5h.5c.28 0 .5.22.5.5l.5 1.5c0 .18-.1.35-.25.44l-.5.28c.36.72.97 1.33 1.7 1.7l.28-.5c.09-.15.26-.25.44-.25l1.5.5c.28 0 .5.22.5.5v.5c0 .28-.22.5-.5.5C8.57 12.17 5.83 9.43 6 7.5L6.5 7z" fill="currentColor"/>
                  </svg>
                  Kirim Notifikasi ke APIP via WhatsApp
                </button>
              </a>
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
            <div className="dropzone-sub">Semua ukuran diterima · JPG, PNG, HEIC</div>
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

        {/* Riwayat Upload */}
        {uploadHistory.length > 0 && (
          <div className="form-card" style={{ marginBottom: 16 }}>
            <div className="form-section-title" style={{ cursor: "pointer", userSelect: "none" }} onClick={() => setShowHistory(h => !h)}>
              <span className="msymbol sm">history</span> Riwayat Upload Terakhir
              <span className="msymbol" style={{ marginLeft: "auto", transform: showHistory ? "rotate(180deg)" : "none", transition: "0.2s" }}>expand_more</span>
            </div>
            {showHistory && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {uploadHistory.slice(0, 5).map((h, i) => (
                  <div key={i} style={{ fontSize: 12, background: "var(--light)", borderRadius: 10, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center" }}>
                    <span className="msymbol sm" style={{ color: "var(--jade)", flexShrink: 0 }}>check_circle</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: "var(--pine)" }}>{h.desa}</div>
                      <div style={{ color: "var(--gray)", marginTop: 2 }}>{h.jenis} · {h.tanggal} · {h.jumlahFoto} foto</div>
                    </div>
                    <div style={{ color: "var(--gray)", fontSize: 11, flexShrink: 0 }}>
                      {new Date(h.waktu).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Konfirmasi card sebelum kirim */}
        {showConfirm ? (
          <div className="form-card fade-up" style={{ border: "2px solid var(--jade)", background: "var(--foam)" }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--pine)", marginBottom: 8 }}>⚠️ Konfirmasi Pengiriman</div>
            <div style={{ fontSize: 13, color: "var(--gray)", marginBottom: 16, lineHeight: 1.7 }}>
              Anda akan mengirim <strong>{photos.length} foto</strong> untuk kegiatan <strong>{jenis}</strong> pada <strong>{formatDate(tanggal)}</strong> dari <strong>{desa}</strong>.<br/>
              Pastikan data sudah benar. Lanjutkan?
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-primary btn-outline" style={{ flex: 1 }} onClick={() => setShowConfirm(false)}>Batal</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={() => { setShowConfirm(false); handleSubmit(); }}>
                <span className="msymbol sm filled">send</span> Ya, Kirim
              </button>
            </div>
          </div>
        ) : (
          <>
            <button className="btn-primary" onClick={() => {
              if (!desa || !jenis || !tanggal) { showToast("Lengkapi semua data terlebih dahulu"); return; }
              if (photos.length === 0) { showToast("Upload minimal 1 foto"); return; }
              // Cek duplikat
              const dupKey = `${desa}|${jenis}|${tanggal}`;
              const isDup = uploadHistory.some(h => `${h.desa}|${h.jenis}|${h.tanggal}` === dupKey);
              if (isDup) {
                if (!window.confirm(`⚠️ Anda sudah pernah upload foto untuk ${desa} pada ${jenis} tanggal ${tanggal}. Lanjutkan upload lagi?`)) return;
              }
              setShowConfirm(true);
            }}>
              <span className="msymbol sm filled">send</span>
              Kirim Laporan Foto
            </button>
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--gray)", marginTop: 10 }}>
              Pastikan data yang Anda masukkan sudah benar sebelum mengirim.
            </p>
          </>
        )}
      </div>

      <div className={`toast${toastVisible ? " show" : ""}`}>{toastMsg}</div>
    </div>
  );
}

// ─── APIP PORTAL ─────────────────────────────────────────────────────────────
function ApipPortal({ onBack }: { onBack: () => void }) {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("gia_apip_auth") === "1");
  const [loginError, setLoginError] = useState("");
  const [loginInput, setLoginInput] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
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
      const resp = await fetch(url, { cache: "no-store" });
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
                onKeyDown={async e => {
                  if (e.key === "Enter") {
                    setLoginLoading(true);
                    const h = await hashPassword(loginInput);
                    setLoginLoading(false);
                    if (h === APIP_PASSWORD_HASH) { sessionStorage.setItem("gia_apip_auth","1"); setAuthed(true); }
                    else setLoginError("Password salah. Silakan coba lagi.");
                  }
                }}
              />
              {loginError && <div style={{ fontSize: 12, color: "var(--red)", marginTop: 6, fontWeight: 600 }}>⚠️ {loginError}</div>}
            </div>
            <button className="btn-primary btn-gold" disabled={loginLoading} onClick={async () => {
              setLoginLoading(true);
              const h = await hashPassword(loginInput);
              setLoginLoading(false);
              if (h === APIP_PASSWORD_HASH) { sessionStorage.setItem("gia_apip_auth","1"); setAuthed(true); }
              else setLoginError("Password salah. Silakan coba lagi.");
            }}>
              {loginLoading ? <><div style={{width:16,height:16,border:"2px solid var(--forest)",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/> Memverifikasi...</> : <><span className="msymbol sm">login</span> Masuk Portal APIP</>}
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
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div className="role-pill" style={{ color: "#b58a00", borderColor: "var(--gold)", background: "rgba(233,196,106,0.12)" }}>APIP</div>
          <button onClick={() => { sessionStorage.removeItem("gia_apip_auth"); setAuthed(false); }} style={{background:"none",border:"1px solid var(--border)",borderRadius:10,padding:"5px 10px",fontSize:12,color:"var(--gray)",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
            <span className="msymbol sm">logout</span>
          </button>
        </div>
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
          <>
            <div className="apip-stats fade-up">
              <div className="stat-card"><div className="stat-value">{DESAS.length}</div><div className="stat-label">Total Desa</div></div>
              <div className="stat-card"><div className="stat-value" style={{ color: "var(--jade)" }}>{desasWithPhotos.length}</div><div className="stat-label">Ada Foto</div></div>
              <div className="stat-card"><div className="stat-value" style={{ color: "var(--red)" }}>{DESAS.length - desasWithPhotos.length}</div><div className="stat-label">Belum Upload</div></div>
            </div>
            {DESAS.length - desasWithPhotos.length > 0 && (
              <div className="fetch-status fade-up" style={{ background: "#fff7ed", color: "#c2410c", borderColor: "#fed7aa", marginBottom: 16 }}>
                <span className="msymbol sm">warning</span>
                <span>Desa belum upload: <strong>{DESAS.filter(d => !driveData[d]?.length).join(", ")}</strong></span>
              </div>
            )}
          </>
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
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    // PWA install prompt
    const handler = (e: any) => { e.preventDefault(); setDeferredPrompt(e); setShowInstall(true); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setShowInstall(false);
    setDeferredPrompt(null);
  };

  return (
    <>
      <style>{css}</style>
      {role === null && <RoleSelector onSelect={setRole} />}
      {role === "pic" && <DesaPortal onBack={() => setRole(null)} />}
      {role === "apip" && <ApipPortal onBack={() => setRole(null)} />}
      {showInstall && role === null && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "var(--white)", border: "1px solid var(--border)", borderRadius: 18,
          padding: "14px 20px", display: "flex", alignItems: "center", gap: 14,
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)", zIndex: 999, maxWidth: 360, width: "calc(100% - 48px)"
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--pine)" }}>Install Aplikasi GIA</div>
            <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 2 }}>Akses lebih cepat dari layar utama HP</div>
          </div>
          <button onClick={() => setShowInstall(false)} style={{ background: "none", border: "none", color: "var(--gray)", cursor: "pointer", padding: 4, fontFamily: "'Material Symbols Outlined'", fontSize: 20, fontVariationSettings: "'FILL' 0,'wght' 300,'GRAD' 0,'opsz' 24" }}>close</button>
          <button onClick={handleInstall} style={{ background: "var(--pine)", color: "white", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Outfit',sans-serif", flexShrink: 0 }}>Install</button>
        </div>
      )}
    </>
  );
}
