import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

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
 * Sesuai Spesifikasi:
 * - Ukuran Label Vertikal: 25 mm x 60 mm dengan sudut rounded
 * - Header Brand & Garansi Produk di bagian atas (0 - 18 mm)
 * - QR CODE di bagian tengah (18 - 35 mm)
 * - Area Gosok PIN: 25 mm x 25 mm rata dari bawah (35 - 60 mm)
 * - Layout PIN: 2 baris (4 digit atas & 4 digit bawah)
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

  // Dimensi Label & Grid Layout
  const STICKER_WIDTH = 25; // 25 mm
  const STICKER_HEIGHT = 62; // 62 mm (proporsional untuk logo 23mm, teks, QR 25x25mm, dan PIN 2 baris)
  const CORNER_RADIUS = 2.0; // mm (ujung sudut rounded)

  // Grid layout pada lembar A3+: 10 kolom x 6 baris = 60 stiker per lembar
  const COLS = 10;
  const ROWS = 6;
  const STICKERS_PER_PAGE = COLS * ROWS; // 60 stiker per lembar A3+

  const GAP_X = 3.0; // mm
  const GAP_Y = 3.5; // mm

  // Hitung offset agar grid simetris dan terpusat di lembar A3+
  const totalGridWidth = COLS * STICKER_WIDTH + (COLS - 1) * GAP_X; // 10*25 + 9*3 = 277 mm
  const totalGridHeight = ROWS * STICKER_HEIGHT + (ROWS - 1) * GAP_Y; // 6*62 + 5*3.5 = 389.5 mm
  const startX = (PAGE_WIDTH - totalGridWidth) / 2; // (310 - 277) / 2 = 16.5 mm
  const startY = (PAGE_HEIGHT - totalGridHeight) / 2 + 5; // mm dari atas

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

    // 1. Gambar Tanda Registrasi Percetakan (Crosshair registration marks di 4 sudut)
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

    // Sheet Header & Info Bar
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text('LEMBAR CETAK LABEL STIKER GOSOK (A3+ 310 x 470 mm)', 16.5, 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    const infoText = `Batch ID: ${batch.batchId}  |  Brand: ${batch.brand}  |  SKU: ${batch.sku}  |  Label: 25 x 60 mm (Area Gosok 25x25 mm)  |  Hal ${pageIdx + 1}/${totalPages} (${pageTags.length} Label)`;
    doc.text(infoText, 16.5, 19.5);

    // Color Calibration Bars (CMYK simulation for printing press)
    const calColors = [
      [56, 59, 130],   // Brand Royal Navy
      [194, 142, 98],  // Sumas Gold Accent
      [0, 160, 230],   // Cyan
      [230, 0, 120],   // Magenta
      [255, 210, 0],   // Yellow
      [30, 30, 30]     // Black
    ];
    calColors.forEach((rgb, cIdx) => {
      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.rect(16.5 + cIdx * 6, 23, 5, 2.5, 'F');
    });

    doc.setDrawColor(226, 232, 240);
    doc.line(16.5, 28, PAGE_WIDTH - 16.5, 28);

    // 2. Render Setiap Sel Label Stiker pada Grid (25 mm x 62 mm, Polosan Full Putih, Outline Cutting Merah)
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
      // BAGIAN 1: LOGO DI ATAS (UKURAN LEBAR 23 MM)
      // ==========================================
      // Laurel Wreath Emblem
      doc.setDrawColor(194, 152, 107); // Gold #c2986b
      doc.setLineWidth(0.24);
      doc.circle(cx, y + 4.2, 2.2);

      doc.setFont('times', 'bold');
      doc.setFontSize(3.8);
      doc.setTextColor(36, 33, 86); // Royal navy
      doc.text('S', cx, y + 5.2, { align: 'center' });

      // Brand Name di bawah emblem (lebar total area logo 23 mm)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.2);
      doc.setTextColor(36, 33, 86);
      const brandClean = (batch.brand || 'SUMAS').toUpperCase().slice(0, 14);
      doc.text(brandClean, cx, y + 9.0, { align: 'center' });

      // ==========================================
      // BAGIAN 2: TEKS ORIGINAL PRODUCT & PRODUK ASLI
      // ==========================================
      // Original Product (kapital bold)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(3.2);
      doc.setTextColor(15, 23, 42); // Black/Slate-900
      doc.text('ORIGINAL PRODUCT', cx, y + 12.5, { align: 'center' });

      // produk asli (regular kapital)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(2.6);
      doc.setTextColor(100, 116, 139); // Slate-500
      doc.text('PRODUK ASLI', cx, y + 15.3, { align: 'center' });

      // ==========================================
      // BAGIAN 3: QR CODE UKURAN 25 mm x 25 mm
      // (Sudah termasuk area putih di sekeliling QR Code)
      // ==========================================
      const qrDataUrl = qrCache.get(tag.tagNumber);
      const qrSize = 25.0; // 25 mm x 25 mm
      const qrX = x; // Pas selebar stiker 25 mm
      const qrY = y + 17.0; // y + 17.0 s/d y + 42.0 mm
      if (qrDataUrl) {
        doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
      }

      // ==========================================
      // BAGIAN 4: PIN DISUSUN 2 BARIS (RAPAT / TANPA RENGGANG)
      // ==========================================
      const rawPin = String(tag.pin || '00000000').replace(/\s+/g, '');
      const half = Math.ceil(rawPin.length / 2);
      const isMultiLine = rawPin.length > 4;
      // Tidak renggang (tanpa spasi antar digit)
      const pinPart1 = isMultiLine ? rawPin.slice(0, half) : rawPin;
      const pinPart2 = isMultiLine ? rawPin.slice(half) : '';

      doc.setFont('courier', 'bold');
      doc.setTextColor(15, 23, 42);

      if (isMultiLine && pinPart2) {
        doc.setFontSize(12.5);
        // Baris 1: digit atas (terpusat secara vertikal di area bawah QR)
        doc.text(pinPart1, cx, y + 50.0, { align: 'center' });
        // Baris 2: digit bawah
        doc.text(pinPart2, cx, y + 56.5, { align: 'center' });
      } else {
        doc.setFontSize(13.0);
        doc.text(pinPart1, cx, y + 53.0, { align: 'center' });
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

    // Sheet Footer Info
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Format Kertas: A3+ (310 x 470 mm) • Ukuran Label: 25 x 62 mm (Full Putih, Outline Cutting Merah) • Logo: 23 mm • QR Code: 25 x 25 mm • PIN: 2 Baris Normal • Grid: 10 x 6 = 60 label/lembar`,
      16.5,
      PAGE_HEIGHT - 6
    );
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
