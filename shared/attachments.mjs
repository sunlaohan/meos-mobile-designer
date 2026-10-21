export const ATTACHMENT_LIMITS = Object.freeze({ count: 6, images: 4, imageBytes: 5 * 1024 * 1024, codeBytes: 100 * 1024, totalCodeBytes: 200 * 1024, totalBytes: 12 * 1024 * 1024, requestBytes: 18 * 1024 * 1024 });
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const CODE_EXTENSIONS = ['vue', 'js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs', 'json', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'md', 'txt', 'py', 'java', 'go', 'rs', 'sql', 'yaml', 'yml', 'xml', 'svg', 'svelte', 'astro', 'swift', 'kt', 'kts', 'c', 'h', 'cpp', 'hpp', 'cs', 'sh'];
export const IMAGE_ACCEPT = IMAGE_TYPES.join(',');
export const CODE_ACCEPT = CODE_EXTENSIONS.map((extension) => `.${extension}`).join(',');

export function attachmentKind(name, mime = '') {
  const extension = String(name).split('.').pop()?.toLowerCase();
  if (IMAGE_TYPES.includes(mime) || ['png', 'jpg', 'jpeg', 'webp'].includes(extension)) return 'image';
  if (CODE_EXTENSIONS.includes(extension)) return 'code';
  return undefined;
}

export function imageMime(name, mime = '') {
  if (IMAGE_TYPES.includes(mime)) return mime;
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' })[String(name).split('.').pop()?.toLowerCase()];
}

export function validateAttachments(input) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > ATTACHMENT_LIMITS.count) throw new Error('最多添加 6 个附件。');
  let total = 0, codeTotal = 0, images = 0;
  const ids = new Set();
  return input.map((item) => {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 180 || /[\0\r\n/\\]/.test(item.name) || typeof item.content !== 'string') throw new Error('附件信息无效，请移除后重新添加。');
    ids.add(item.id);
    let size;
    if (item.kind === 'image') {
      if (++images > ATTACHMENT_LIMITS.images) throw new Error('最多添加 4 张图片。');
      const match = item.content.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match || match[1] !== item.mimeType || match[2].length % 4 !== 0) throw new Error('图片格式无效，仅支持 PNG、JPG、WebP。');
      size = match[2].length / 4 * 3 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
      if (!size || size > ATTACHMENT_LIMITS.imageBytes) throw new Error('单张图片不能超过 5MB。');
      const header = atob(match[2].slice(0, 24));
      const valid = item.mimeType === 'image/png' ? header.startsWith('\x89PNG\r\n\x1a\n') : item.mimeType === 'image/jpeg' ? header.startsWith('\xff\xd8\xff') : header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
      if (!valid) throw new Error('图片内容与格式不匹配，请重新选择图片。');
    } else if (item.kind === 'code') {
      if (attachmentKind(item.name) !== 'code' || item.mimeType !== 'text/plain') throw new Error('请选择 Vue、JS、TS、CSS、JSON 等代码或文本文件。');
      if (!item.content.trim() || /\0|[\x01-\x08\x0b\x0c\x0e-\x1f]/.test(item.content)) throw new Error('代码附件为空或包含二进制内容，请选择 UTF-8 文本文件。');
      size = new TextEncoder().encode(item.content).byteLength;
      if (size > ATTACHMENT_LIMITS.codeBytes) throw new Error('单份代码附件不能超过 100KB。');
      codeTotal += size;
      if (codeTotal > ATTACHMENT_LIMITS.totalCodeBytes) throw new Error('代码附件合计不能超过 200KB。');
    } else throw new Error('不支持的附件类型。');
    if (item.size !== size) throw new Error('附件大小校验失败，请重新添加。');
    total += size;
    if (total > ATTACHMENT_LIMITS.totalBytes) throw new Error('附件总大小不能超过 12MB。');
    return { id: item.id, name: item.name.trim(), kind: item.kind, mimeType: item.mimeType, size, content: item.content };
  });
}

export function attachmentUserContent(text, attachments) {
  const images = attachments.filter((item) => item.kind === 'image');
  return images.length ? [{ type: 'text', text }, ...images.map((item) => ({ type: 'image_url', image_url: { url: item.content } }))] : text;
}

// Image inputs wired through the gateway's OpenAI-compatible multimodal protocol.
// Other routes remain available for code/text and fail explicitly for image input.
export function supportsImageInput(id) {
  return /^(?:gemini-|claude-|gpt-5\.6-|qwen3\.[5-9]-(?:flash|plus)|qwen3-vl-|qwen-vl-|kimi-k2\.[67])/.test(id);
}
