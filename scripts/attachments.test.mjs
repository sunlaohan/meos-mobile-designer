import assert from 'node:assert/strict';
import test from 'node:test';
import { ATTACHMENT_LIMITS, attachmentKind, attachmentUserContent, supportsImageInput, validateAttachments } from '../shared/attachments.mjs';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jg1kAAAAASUVORK5CYII=';
const image = (extra = {}) => ({ id: 'image', name: '参考.png', kind: 'image', mimeType: 'image/png', size: Buffer.from(png.split(',')[1], 'base64').length, content: png, ...extra });
const code = (content = '<template>设备档案</template>', extra = {}) => ({ id: 'code', name: 'reference.vue', kind: 'code', mimeType: 'text/plain', size: Buffer.byteLength(content), content, ...extra });

test('识别图片、代码与文本文件，拒绝压缩包和可执行文件', () => {
  assert.equal(attachmentKind('screenshot.PNG'), 'image');
  assert.equal(attachmentKind('pasted', 'image/png'), 'image');
  for (const extension of ['vue', 'ts', 'js', 'css', 'json', 'html', 'md', 'py']) assert.equal(attachmentKind(`file.${extension}`), 'code');
  assert.equal(attachmentKind('archive.zip'), undefined);
  assert.equal(attachmentKind('app.exe'), undefined);
});

test('校验图片与代码真实字节大小，Unicode、HTML和脚本保留为参考文本', () => {
  const input = [image(), code('<script>const title="设备档案";</script>')];
  assert.deepEqual(validateAttachments(input), input);
  assert.throws(() => validateAttachments([image({ size: 1 })]), /大小校验/);
  assert.throws(() => validateAttachments([code('const content="x"', { size: 1 })]), /大小校验/);
  assert.throws(() => validateAttachments([code('\0binary')]), /二进制/);
  assert.throws(() => validateAttachments([code(' ')]), /为空/);
});

test('图片必须为内联受支持格式，拒绝外链、SVG伪装和类型不匹配', () => {
  assert.throws(() => validateAttachments([image({ content: 'https://untrusted.example/picture.png' })]), /格式无效/);
  assert.throws(() => validateAttachments([image({ content: 'data:image/png;base64,' + Buffer.from('<svg onload="alert(1)"></svg>').toString('base64') })]), /不匹配|格式/);
  assert.throws(() => validateAttachments([image({ mimeType: 'image/jpeg' })]), /格式无效/);
  assert.throws(() => validateAttachments([code('x', { name: '../ref.vue' })]), /信息无效/);
});

test('限制附件个数、图片个数、单文件及代码总量，重复标识不能混入请求', () => {
  assert.throws(() => validateAttachments(Array.from({ length: 7 }, (_, index) => code('x', { id: String(index) }))), /最多添加 6/);
  assert.throws(() => validateAttachments(Array.from({ length: 5 }, (_, index) => image({ id: String(index) }))), /最多添加 4/);
  assert.throws(() => validateAttachments([code('x'.repeat(ATTACHMENT_LIMITS.codeBytes + 1))]), /100KB/);
  assert.throws(() => validateAttachments(Array.from({ length: 3 }, (_, index) => code('x'.repeat(80000), { id: String(index) }))), /合计/);
  assert.throws(() => validateAttachments([image(), image()]), /信息无效/);
});

test('图片作为多模态 image_url 发送，代码保持文本上下文；纯文本请求格式不变', () => {
  const content = attachmentUserContent('按参考图生成', [image(), code()]);
  assert.equal(content[0].type, 'text');
  assert.equal(content[1].type, 'image_url');
  assert.equal(content[1].image_url.url, png);
  assert.equal(attachmentUserContent('代码上下文', [code()]), '代码上下文');
  assert.equal(supportsImageInput('gemini-3.8-flash'), true);
  assert.equal(supportsImageInput('qwen3.5-flash'), true);
  assert.equal(supportsImageInput('glm-5-turbo'), false);
});
