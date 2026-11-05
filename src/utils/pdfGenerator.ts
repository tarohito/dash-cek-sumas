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
 */
async function createQrCodeDataUrl(payload: string): Promise<string> {
  try {
    return await QRCode.toDataURL(payload, {
      width: 280,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('Gagal generate QR Code:', err);
    // Fallback 1x1 white pixel
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
 * Render PDF Layout Cetak Stiker Gosok pada format A3+ (31 x 47 cm = 310 x 470 mm)
 * dengan QR CODE di atas dan kotak PIN di bawahnya.
 */
export async function generateA3PlusStickersPdf(
  batch: BatchItem,
  tags: TagItem[],
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  // Ukuran kertas A3+: 310 mm x 470 mm (31 x 47 cm)
  const PAGE_WIDTH = 310;
  const PAGE_HEIGHT = 470;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [PAGE_WIDTH, PAGE_HEIGHT]
  });

  // Konfigurasi Grid Stiker pada Lembar A3+
  // Kolom: 11 stiker per baris, Baris: 10 stiker per kolom = 110 stiker per lembar A3+
  const COLS = 11;
  const ROWS = 10;
  const STICKERS_PER_PAGE = COLS * ROWS; // 110 stiker

  const STICKER_WIDTH = 24; // mm
  const STICKER_HEIGHT = 40; // mm
  const GAP_X = 2.5; // mm
  const GAP_Y = 2.8; // mm

  // Hitung offset agar grid terpusat (center alignment) di lembar A3+
  const totalGridWidth = COLS * STICKER_WIDTH + (COLS - 1) * GAP_X; // 24*11 + 10*2.5 = 289 mm
  const startX = (PAGE_WIDTH - totalGridWidth) / 2; // (310 - 289)/2 = 10.5 mm
  const startY = 22; // mm dari atas

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

    // 1. Gambar Sheet Header & Tanda Registrasi Percetakan (Crosshair marks)
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);

    const markLen = 6;
    const corners = [
      { x: 6, y: 6 },
      { x: PAGE_WIDTH - 6, y: 6 },
      { x: 6, y: PAGE_HEIGHT - 6 },
      { x: PAGE_WIDTH - 6, y: PAGE_HEIGHT - 6 }
    ];
    corners.forEach(c => {
      doc.line(c.x - markLen, c.y, c.x + markLen, c.y);
      doc.line(c.x, c.y - markLen, c.x, c.y + markLen);
      doc.circle(c.x, c.y, 2);
    });

    // Sheet Title & Info Bar
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text('MKI - LEMBAR CETAK STIKER GOSOK (A3+ 31 x 47 cm)', 12, 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    const infoText = `Batch: ${batch.batchId}  |  Brand: ${batch.brand}  |  SKU: ${batch.sku}  |  Tipe: ${batch.qrType === 'static' ? 'QR Statis' : 'QR Dinamis'}  |  Halaman ${pageIdx + 1} dari ${totalPages}  |  Isi: ${pageTags.length} Tag`;
    doc.text(infoText, 12, 14.5);

    doc.setDrawColor(226, 232, 240);
    doc.line(12, 16.5, PAGE_WIDTH - 12, 16.5);

    // 2. Render Setiap Sel Stiker pada Grid
    for (let i = 0; i < pageTags.length; i++) {
      const tag = pageTags[i];
      const col = i % COLS;
      const row = Math.floor(i / COLS);

      const x = startX + col * (STICKER_WIDTH + GAP_X);
      const y = startY + row * (STICKER_HEIGHT + GAP_Y);

      // Garis potong stiker (cutting / die-cut guide)
      doc.setDrawColor(215, 220, 228);
      doc.setLineWidth(0.18);
      doc.rect(x, y, STICKER_WIDTH, STICKER_HEIGHT);

      // a. Micro Header Stiker (Brand & Tag ID)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4.5);
      doc.setTextColor(51, 65, 85);
      const brandClean = (batch.brand || 'MKI').toUpperCase().slice(0, 16);
      doc.text(brandClean, x + STICKER_WIDTH / 2, y + 3.2, { align: 'center' });

      doc.setFont('courier', 'bold');
      doc.setFontSize(4.5);
      doc.setTextColor(100, 116, 139);
      doc.text(tag.tagNumber, x + STICKER_WIDTH / 2, y + 5.6, { align: 'center' });

      // b. QR CODE (Presisi & Tajam)
      const qrDataUrl = qrCache.get(tag.tagNumber);
      const qrSize = 16.5; // mm (persegi)
      const qrX = x + (STICKER_WIDTH - qrSize) / 2;
      const qrY = y + 6.6; // mm
      if (qrDataUrl) {
        doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
      }

      // c. Kotak Area Gosok PIN di Bawah QR Code
      const pinBoxW = 20;
      const pinBoxH = 10.5;
      const pinBoxX = x + (STICKER_WIDTH - pinBoxW) / 2;
      const pinBoxY = y + 24;

      // Background kotak area gosok (simulasi foil perak)
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.roundedRect(pinBoxX, pinBoxY, pinBoxW, pinBoxH, 1, 1, 'FD');

      // Teks instruksi di dalam kotak gosok
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(3.8);
      doc.setTextColor(148, 163, 184);
      doc.text('GOSOK PIN DI SINI', x + STICKER_WIDTH / 2, pinBoxY + 3.2, { align: 'center' });

      // Digit PIN di bawah QR Code (format besar, jelas & tegas)
      doc.setFont('courier', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(tag.pin, x + STICKER_WIDTH / 2, pinBoxY + 7.5, { align: 'center' });

      // d. Micro URL Verifikasi di bagian paling bawah stiker
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(3.5);
      doc.setTextColor(148, 163, 184);
      doc.text('cek.sumas.id', x + STICKER_WIDTH / 2, y + 37.8, { align: 'center' });

      if (onProgress) {
        const overallIdx = pageIdx * STICKERS_PER_PAGE + i + 1;
        onProgress(overallIdx, tags.length);
      }
    }

    // Sheet Footer info
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Format Cetak: A3+ (310 x 470 mm) • Stiker: 24 x 40 mm • Grid: 11 x 10 = 110 stiker/lembar • Dicetak dari Sistem Verifikasi MKI`,
      12,
      PAGE_HEIGHT - 6
    );
  }

  return doc.output('blob');
}

/**
 * Generate File CSV Tabular untuk ekspor Excel
 */
export function generateTagsCsv(batch: BatchItem, tags: TagItem[]): Blob {
  const headers = ['No', 'Batch ID', 'Nomor Tag', 'Digit PIN', 'Status Tag', 'Proyek', 'Brand', 'Produk SKU', 'Tipe QR', 'URL Verifikasi'];
  const rows = tags.map((t, idx) => [
    idx + 1,
    `"${batch.batchId}"`,
    `"${t.tagNumber}"`,
    `"${t.pin}"`,
    `"${t.status || 'Tersedia'}"`,
    `"${t.project || '-'}"`,
    `"${batch.brand}"`,
    `"${batch.sku}"`,
    `"${batch.qrType === 'static' ? 'QR Statis' : 'QR Dinamis'}"`,
    `"${batch.redirectUrl || 'https://cek.sumas.id/'}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
}
