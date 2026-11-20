/**
 * Utilitas kompresi gambar otomatis dan konversi ke format WebP di sisi klien (browser).
 * Menjaga rasio aspek (aspect ratio), mengoptimalkan resolusi, dan memangkas ukuran file hingga 90%+.
 */

export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // Nilai 0.1 sampai 1.0 (rekomendasi: 0.82 untuk web visual tajam namun ringan)
}

/**
 * Mengompresi file gambar yang diunggah dan mengonversinya menjadi format data URL image/webp.
 * Jika berkas adalah SVG, vektor asli dipertahankan agar ketajaman tidak hilang.
 */
export const compressAndConvertToWebP = (
  file: File,
  options: ImageOptimizationOptions = {}
): Promise<string> => {
  const { maxWidth = 1200, maxHeight = 1200, quality = 0.82 } = options;

  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('Berkas yang dipilih bukan berkas gambar valid.'));
    }

    // Jika berkas adalah SVG, jangan rasterisasi agar tetap tajam sebagai vektor
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Gagal membaca berkas SVG.'));
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Hitung proporsi dimensi dengan membatasi lebar & tinggi maksimum
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Fallback jika konteks canvas 2D tidak tersedia
          return resolve(e.target?.result as string);
        }

        // Aktifkan interpolasi kualitas tinggi
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Gambar ulang ke canvas
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        try {
          // Ekspor ke WebP dengan kompresi kualitas
          const webpDataUrl = canvas.toDataURL('image/webp', quality);
          if (webpDataUrl.startsWith('data:image/webp')) {
            resolve(webpDataUrl);
          } else {
            // Fallback ke JPEG jika browser lama tidak mendukung encode WebP canvas
            resolve(canvas.toDataURL('image/jpeg', quality));
          }
        } catch {
          // Fallback ke base64 asli jika terjadi kegagalan canvas
          resolve(e.target?.result as string);
        }
      };

      img.onerror = () => {
        reject(new Error('Gagal memproses gambar untuk kompresi.'));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
    reader.readAsDataURL(file);
  });
};
