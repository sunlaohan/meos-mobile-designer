import { ATTACHMENT_LIMITS, imageMime } from '../../shared/attachments.mjs';
import { readBuildAttachment } from './buildAttachments';

export async function readComponentImage(file: File) {
  if (!imageMime(file.name, file.type)) throw new Error('请选择 PNG、JPG 或 WebP 图片。');
  if (file.size > ATTACHMENT_LIMITS.imageBytes) throw new Error('单张图片不能超过 5MB。');
  return (await readBuildAttachment(file)).content;
}

export function randomImageSource(seed = crypto.randomUUID()) {
  // A stable seed keeps the selected photo unchanged when the document reopens.
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/720/320`;
}

export function loadComponentImage(src: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const finish = (error?: Error) => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener('abort', abort);
      if (error) { image.removeAttribute('src'); reject(error); }
      else resolve();
    };
    const abort = () => finish(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('网络图片加载失败，请重试或选择本地图片。')), 15000);
    image.onload = () => finish();
    image.onerror = () => finish(new Error('网络图片加载失败，请重试或选择本地图片。'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    image.src = src;
  });
}
