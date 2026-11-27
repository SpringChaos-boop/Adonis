/**
 * admin/image.js — подготовка изображений перед загрузкой.
 *
 * Большие файлы с телефона/скана режем до maxWidth и пережимаем:
 *   • PNG остаётся PNG (сохраняем прозрачность);
 *   • всё остальное — WebP (меньше вес при том же качестве);
 *   • SVG и GIF отдаём как есть.
 */

const KEEP_TYPES = new Set(['image/svg+xml', 'image/gif']);

export async function prepareImage(file, { maxWidth = 1600, quality = 0.86 } = {}) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    throw new Error('Это не изображение');
  }

  if (KEEP_TYPES.has(file.type)) {
    const ext = file.type === 'image/svg+xml' ? 'svg' : 'gif';
    return { blob: file, ext, width: null, height: null };
  }

  const source = await decode(file);
  const scale = Math.min(1, maxWidth / source.width);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не смог обработать изображение');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);

  const type = file.type === 'image/png' ? 'image/png' : 'image/webp';
  const blob = await toBlob(canvas, type, quality);
  if (!blob) throw new Error('Не удалось пережать изображение');

  return {
    blob,
    ext: type === 'image/png' ? 'png' : 'webp',
    width,
    height,
  };
}

function decode(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).catch(() => decodeWithImage(file));
  }
  return decodeWithImage(file);
}

function decodeWithImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение'));
    };
    image.src = url;
  });
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Имя файла для локального режима: assets/photo-20261127-ab12.webp */
export function localFileName(ext) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 6);
  return `image-${stamp}-${random}.${ext}`;
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
