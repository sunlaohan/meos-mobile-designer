// Keep intent separate from the user's prompt so image-only requests work in both
// planning and generation without treating reference documents as instructions.
export function generationInput(request, attachments) {
  const inputMode = request.inputMode ?? 'requirements';
  if (!['requirements', 'image'].includes(inputMode)) throw new Error('请选择有效的生成模式。');
  if (request.imageAction !== undefined && (inputMode !== 'image' || !['recreate', 'beautify'].includes(request.imageAction))) throw new Error('请选择有效的图片处理方式。');
  const imageAction = inputMode === 'image' ? request.imageAction ?? 'beautify' : undefined;
  if (inputMode === 'image') {
    if (!attachments.some(item => item.kind === 'image')) throw new Error('请先上传、粘贴或拖入页面图片。');
    if (attachments.some(item => item.kind !== 'image')) throw new Error('图片模式仅支持图片，请切换到需求生成添加文档。');
  }
  if (!request.prompt?.trim() && !attachments.length) throw new Error('请填写页面需求或添加图片、文档附件。');
  const instructions = inputMode !== 'image' ? '' : imageAction === 'beautify'
    ? '当前任务为图片智能美化：以参考图片为基础，保留主要内容、字段、业务含义和交互入口，在组件库规范范围内优化信息层级、对齐、分组、留白与布局；不要凭空增删业务功能。输出可编辑的真实组件页面，不是图片文件。'
    : '当前任务为图片还原布局：识别参考图片中的可见文案、字段、区域顺序和交互入口，尽可能保留原有信息结构和布局，使用组件库的等效组件还原；组件外观以库内规范为准。输出可编辑的真实组件页面，不是图片文件。';
  const prompt = request.prompt?.trim() || (inputMode === 'image'
    ? imageAction === 'beautify' ? '请根据参考图片美化移动页面，保留主要内容与业务含义，并自动提炼页面标题。' : '请根据参考图片还原可编辑的移动页面，并自动提炼页面标题。'
    : '请根据附件中的图片、Markdown 和代码文档，按组件库规范生成可编辑的移动页面，并自动提炼页面标题。');
  return { inputMode, imageAction, prompt, instructions };
}
