import { ATTACHMENT_LIMITS, attachmentKind, imageMime, validateAttachments } from '../../shared/attachments.mjs';
import type { BuildAttachment } from '../types';

export async function readBuildAttachment(file: File): Promise<BuildAttachment> {
  const name = file.name.split(/[\\/]/).pop() || '粘贴图片.png';
  const kind = attachmentKind(name, file.type);
  if (!kind) throw new Error(`不支持「${name}」，请选择图片、代码或文本文件。`);
  if (file.size > (kind === 'image' ? ATTACHMENT_LIMITS.imageBytes : ATTACHMENT_LIMITS.codeBytes)) throw new Error(`${name} 超过大小限制：图片 5MB，代码 100KB。`);
  let content: string;
  if (kind === 'image') {
    const data = await file.arrayBuffer();
    // Check the actual browser decoder, rather than trusting a renamed extension.
    const bitmap = await createImageBitmap(new Blob([data])).catch(() => { throw new Error(`${name} 不是可读取的图片。`); });
    const pixels = bitmap.width * bitmap.height;
    bitmap.close();
    if (pixels > 40000000) throw new Error(`${name} 分辨率过大，请使用不超过 4000 万像素的图片。`);
    content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`无法读取 ${name}，请重试。`));
      reader.readAsDataURL(new Blob([data], { type: imageMime(name, file.type) }));
    });
  } else {
    try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer()); }
    catch { throw new Error(`${name} 不是 UTF-8 文本文件，请转换编码后添加。`); }
  }
  return validateAttachments([{ id: crypto.randomUUID(), name, kind, mimeType: kind === 'image' ? imageMime(name, file.type) : 'text/plain', size: file.size, content }])[0];
}

export function formatAttachmentSize(size: number) {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.ceil(size / 1024))}KB`;
}
