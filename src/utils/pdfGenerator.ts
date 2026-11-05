import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { KODE_MONO_BOLD_BASE64 } from './kodeMonoFont';

export interface TagItem {
  id: string;
  batchId: string;
  tagNumber: string;
  pin: string;
  status?: string;
  project?: string;
}

export interface BatchItem {
  id: string;
  batchId: string;
  date: string;
  sku: string;
  brand: string;
  qty: number;
  qrType?: string;
  redirectUrl?: string;
}

/**
 * Menyimpan file menggunakan native file picker OS (showSaveFilePicker)
 * sehingga pengguna dapat memilih lokasi folder dan memberi nama file secara bebas.
 * Jika browser atau iframe tidak mendukung, otomatis fallback ke download biasa.
 */
export async function saveFileWithNativePicker(
  blob: Blob,
  suggestedName: string,
  mimeType: string,
  extension: string
): Promise<{ success: boolean; fileName: string; method: 'picker' | 'download'; aborted?: boolean }> {
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: `${extension.toUpperCase()} File (*.${extension})`,
            accept: {
              [mimeType]: [`.${extension}`]
            }
          }
        ]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { success: true, fileName: handle.name, method: 'picker' };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, fileName: suggestedName, method: 'picker', aborted: true };
      }
      console.warn('Native showSaveFilePicker tidak tersedia atau dibatasi, menggunakan fallback:', err);
    }
  }

  // Fallback: Standar tag <a> download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { success: true, fileName: suggestedName, method: 'download' };
}

/**
 * Menghasilkan image data URL untuk QR Code menggunakan qrcode library
 * Resolusi 350px untuk ketajaman optimal saat dicetak
 */
async function createQrCodeDataUrl(payload: string): Promise<string> {
  try {
    return await QRCode.toDataURL(payload, {
      width: 400,
      margin: 2, // sudah termasuk area putih di sekeliling qrcodenya
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('Gagal generate QR Code:', err);
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  }
}

/**
 * Menentukan isi payload QR Code berdasarkan tipe batch (Statis / Dinamis)
 */
function getQrCodePayload(batch: BatchItem, tag: TagItem): string {
  const base = (batch.redirectUrl || 'https://cek.sumas.id/').trim();
  if (batch.qrType === 'static') {
    return base;
  }
  // Dinamis: langsung menyematkan ID & PIN agar saat di-scan langsung verifikasi
  const cleanBase = base.replace(/\/+$/, '');
  const separator = cleanBase.includes('?') ? '&' : '/?';
  return `${cleanBase}${separator}id=${encodeURIComponent(tag.tagNumber)}&pin=${encodeURIComponent(tag.pin)}`;
}

/**
 * Render PDF Layout Cetak Stiker Gosok pada format A3+ (310 x 470 mm)
 * Sesuai Panduan Ukuran Resmi:
 * - Total Ukuran Label: 25 mm x 60 mm (sudut rounded halus R2.0 mm, outline cutting merah)
 * - Bagian 1 (Atas): Header Brand & Logo (w: 25 mm, h: 23 mm)
 * - Bagian 2 (Tengah): QR Code (w: 25 mm, h: 25 mm)
 * - Bagian 3 (Bawah): Area Gosok PIN (w: 25 mm, h: 9.6 mm) disusun 2 baris (4 digit atas & 4 digit bawah)
 *   Font: Kode Mono Bold, ukuran pas (13.5 pt), jarak baris atas & bawah rapat (~1.3 mm gap visual)
 */
export async function generateA3PlusStickersPdf(
  batch: BatchItem,
  tags: TagItem[],
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  // Ukuran kertas A3+: 310 mm x 470 mm
  const PAGE_WIDTH = 310;
  const PAGE_HEIGHT = 470;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [PAGE_WIDTH, PAGE_HEIGHT]
  });

  // Register Kode Mono Bold TrueType Font
  try {
    doc.addFileToVFS('KodeMono-Bold.ttf', KODE_MONO_BOLD_BASE64);
    doc.addFont('KodeMono-Bold.ttf', 'KodeMono', 'bold');
  } catch (err) {
    console.warn('Could not register KodeMono font in jsPDF:', err);
  }

  // Dimensi Label & Grid Layout Sesuai Panduan Ukuran: 25 mm x 60 mm
  const STICKER_WIDTH = 25; // 25 mm
  const STICKER_HEIGHT = 60; // 60 mm (total keseluruhan label tag: 25 mm x 60 mm)
  const CORNER_RADIUS = 2.0; // mm (ujung sudut rounded)

  // Grid layout pada lembar A3+: 10 kolom x 6 baris = 60 stiker per lembar
  const COLS = 10;
  const ROWS = 6;
  const STICKERS_PER_PAGE = COLS * ROWS; // 60 stiker per lembar A3+

  const GAP_X = 3.0; // mm
  const GAP_Y = 4.0; // mm

  // Hitung offset agar grid simetris dan terpusat di lembar A3+ (Header & Footer dihapus, hanya marking sensor sudut)
  const totalGridWidth = COLS * STICKER_WIDTH + (COLS - 1) * GAP_X; // 10*25 + 9*3 = 277 mm
  const totalGridHeight = ROWS * STICKER_HEIGHT + (ROWS - 1) * GAP_Y; // 6*60 + 5*4 = 380 mm
  const startX = (PAGE_WIDTH - totalGridWidth) / 2; // (310 - 277) / 2 = 16.5 mm
  const startY = (PAGE_HEIGHT - totalGridHeight) / 2; // (470 - 380) / 2 = 45 mm (simetris di tengah lembar A3+)

  const totalPages = Math.max(1, Math.ceil(tags.length / STICKERS_PER_PAGE));

  // Pre-generate QR Code data URLs
  const qrCache = new Map<string, string>();
  for (let idx = 0; idx < tags.length; idx++) {
    const t = tags[idx];
    const payload = getQrCodePayload(batch, t);
    const dataUrl = await createQrCodeDataUrl(payload);
    qrCache.set(t.tagNumber, dataUrl);
    if (onProgress && idx % 20 === 0) {
      onProgress(idx + 1, tags.length);
    }
  }

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) {
      doc.addPage([PAGE_WIDTH, PAGE_HEIGHT], 'portrait');
    }

    const pageTags = tags.slice(pageIdx * STICKERS_PER_PAGE, (pageIdx + 1) * STICKERS_PER_PAGE);

    // 1. Gambar Tanda Registrasi Percetakan (Crosshair sensor registration marks di 4 sudut lembar A3+)
    doc.setDrawColor(160, 165, 175);
    doc.setLineWidth(0.25);

    const markLen = 7;
    const corners = [
      { x: 8, y: 8 },
      { x: PAGE_WIDTH - 8, y: 8 },
      { x: 8, y: PAGE_HEIGHT - 8 },
      { x: PAGE_WIDTH - 8, y: PAGE_HEIGHT - 8 }
    ];
    corners.forEach(c => {
      doc.line(c.x - markLen, c.y, c.x + markLen, c.y);
      doc.line(c.x, c.y - markLen, c.x, c.y + markLen);
      doc.circle(c.x, c.y, 2.2);
    });

    // 2. Render Setiap Sel Label Stiker pada Grid (25 mm x 60 mm, Polosan Full Putih, Outline Cutting Merah)
    for (let i = 0; i < pageTags.length; i++) {
      const tag = pageTags[i];
      const col = i % COLS;
      const row = Math.floor(i / COLS);

      const x = startX + col * (STICKER_WIDTH + GAP_X);
      const y = startY + row * (STICKER_HEIGHT + GAP_Y);
      const cx = x + STICKER_WIDTH / 2;

      // ==========================================
      // BACKGROUND LABEL: POLOSAN FULL PUTIH
      // ==========================================
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, y, STICKER_WIDTH, STICKER_HEIGHT, CORNER_RADIUS, CORNER_RADIUS, 'F');

      // ==========================================
      // BAGIAN 1: HEADER & LOGO (w: 25 mm, h: 23 mm)
      // Rentang vertikal: y s/d y + 23 mm
      // Semua objek terpusat secara vertikal (vertical center: y + 11.5 mm)
      // ==========================================
      // Laurel Wreath Emblem & Monogram (Center: y + 6.0 mm, radius 2.5 mm)
      doc.setDrawColor(36, 33, 86); // Navy / Dark slate
      doc.setLineWidth(0.25);
      doc.circle(cx, y + 6.0, 2.5);

      doc.setFont('times', 'bold');
      doc.setFontSize(4.4);
      doc.setTextColor(36, 33, 86);
      doc.text('S', cx, y + 7.3, { align: 'center' });

      // Brand Name di bawah emblem (e.g. SUMAS)
      doc.setFont('times', 'bold');
      doc.setFontSize(5.8);
      doc.setTextColor(24, 24, 27);
      const brandClean = (batch.brand || 'SUMAS').toUpperCase().slice(0, 14);
      doc.text(brandClean, cx, y + 12.0, { align: 'center' });

      // Teks Subtitle 1: ORIGINAL PRODUCT (Ukuran Font: 5)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.0);
      doc.setTextColor(15, 23, 42); // Black/Slate-900
      doc.text('ORIGINAL PRODUCT', cx, y + 15.6, { align: 'center' });

      // Teks Subtitle 2: PRODUK ASLI (Ukuran Font: 5, Gap rapat dengan baris atas)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.0);
      doc.setTextColor(71, 85, 105); // Slate-600
      doc.text('PRODUK ASLI', cx, y + 18.0, { align: 'center' });

      // ==========================================
      // BAGIAN 2: QR CODE UKURAN 25 mm x 25 mm
      // Rentang vertikal: y + 23 mm s/d y + 48 mm
      // Terpusat vertikal dan horizontal (Center: y + 35.5 mm)
      // ==========================================
      const qrDataUrl = qrCache.get(tag.tagNumber);
      const qrSize = 25.0; // 25 mm x 25 mm persis sesuai panduan
      const qrX = x; // Pas selebar stiker 25 mm
      const qrY = y + 23.0; // y + 23.0 s/d y + 48.0 mm
      if (qrDataUrl) {
        doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
      }

      // ==========================================
      // BAGIAN 3: PIN AREA (w: 25 mm, h: 12 mm / slot 9.6 mm)
      // Rentang vertikal: y + 48.0 s/d y + 60.0 mm
      // Terpusat secara vertikal (Center: y + 54.0 mm)
      // PIN 2 baris (4 digit atas & 4 digit bawah)
      // Digit PIN PADAT TANPA SPASI (misal: "0123" dan "4567")
      // Font: Kode Mono Bold, ukuran font: 14 & gap baris rapat
      // ==========================================
      const rawPin = String(tag.pin || '00000000').replace(/\s+/g, '');
      const half = Math.ceil(rawPin.length / 2);
      const isMultiLine = rawPin.length > 4;

      // Penulisan digit PIN padat TANPA SPASI tiap digitnya
      const pinPart1 = isMultiLine ? rawPin.slice(0, half) : rawPin;
      const pinPart2 = isMultiLine ? rawPin.slice(half) : '';

      try {
        doc.setFont('KodeMono', 'bold');
      } catch (_) {
        doc.setFont('courier', 'bold');
      }
      doc.setTextColor(15, 23, 42); // Black/Slate-900

      if (isMultiLine && pinPart2) {
        // Ukuran font PIN 14.0
        doc.setFontSize(14.0);
        // Baris 1: digit atas (baseline y + 53.2 mm)
        doc.text(pinPart1, cx, y + 53.2, { align: 'center' });
        // Baris 2: digit bawah (baseline y + 57.5 mm, jarak baseline 4.3 mm, gap rapat & center vertikal)
        doc.text(pinPart2, cx, y + 57.5, { align: 'center' });
      } else {
        doc.setFontSize(14.0);
        // Single line terpusat vertikal pada y + 55.0 mm
        doc.text(pinPart1, cx, y + 55.0, { align: 'center' });
      }

      // ==========================================
      // OUTLINE TIPIS UNTUK CUTTING WARNA MERAH
      // ==========================================
      doc.setDrawColor(220, 38, 38); // Merah tajam die-cut
      doc.setLineWidth(0.18); // Outline tipis
      doc.roundedRect(x, y, STICKER_WIDTH, STICKER_HEIGHT, CORNER_RADIUS, CORNER_RADIUS, 'S');

      if (onProgress) {
        const overallIdx = pageIdx * STICKERS_PER_PAGE + i + 1;
        onProgress(overallIdx, tags.length);
      }
    }
  }

  return doc.output('blob');
}

/**
 * Generate File CSV Tabular untuk ekspor Excel
 * Menyertakan PIN utuh, Baris 1 (digit atas), dan Baris 2 (digit bawah jika ada)
 */
export function generateTagsCsv(batch: BatchItem, tags: TagItem[]): Blob {
  const headers = [
    'No',
    'Batch ID',
    'Nomor Tag',
    'PIN',
    'PIN Baris 1 (Atas)',
    'PIN Baris 2 (Bawah)',
    'Status Tag',
    'Proyek',
    'Brand',
    'Produk SKU',
    'Tipe QR',
    'URL Verifikasi'
  ];

  const rows = tags.map((t, idx) => {
    const rawPin = String(t.pin || '').replace(/\s+/g, '');
    const half = Math.ceil(rawPin.length / 2);
    const p1 = rawPin.length > 4 ? rawPin.slice(0, half) : rawPin;
    const p2 = rawPin.length > 4 ? rawPin.slice(half) : '';
    return [
      idx + 1,
      `"${batch.batchId}"`,
      `"${t.tagNumber}"`,
      `"${rawPin}"`,
      `"${p1}"`,
      `"${p2}"`,
      `"${t.status || 'Tersedia'}"`,
      `"${t.project || '-'}"`,
      `"${batch.brand}"`,
      `"${batch.sku}"`,
      `"${batch.qrType === 'static' ? 'QR Statis' : 'QR Dinamis'}"`,
      `"${batch.redirectUrl || 'https://cek.sumas.id/'}"`
    ];
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
}
