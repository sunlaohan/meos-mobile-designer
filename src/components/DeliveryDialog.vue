<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowRight, Check, Copy, Download, FileText, Image, PackageCheck, Plus, RefreshCw, Rocket, X } from 'lucide-vue-next';
import AsyncButton from './AsyncButton.vue';
import DeliveryCapture from './DeliveryCapture.vue';
import { useI18n } from '../utils/i18n';
import type { CanvasArtboard, DesignSource } from '../types';
import { boardSource, suggestedDeliveryMode, type DeliveryMode } from '../utils/deliverySource';
import { formatAttachmentSize, readBuildAttachment } from '../utils/buildAttachments';
import { validateAttachments, IMAGE_ACCEPT, DOCUMENT_ACCEPT } from '../../shared/attachments.mjs';
import { createDeliveryArchive, downloadDelivery } from '../utils/exportDelivery';

const { t } = useI18n();
const props = defineProps<{ title: string; artboards: CanvasArtboard[]; activeId: string }>();
const emit = defineEmits<{ (event: 'close'): void; (event: 'source', id: string, source: DesignSource): void; (event: 'advanced', kind: 'vue' | 'json' | 'md'): void }>();
const active = computed(() => props.artboards.find(board => board.id === props.activeId) || props.artboards[0]);
const mode = ref<DeliveryMode>(suggestedDeliveryMode(active.value));
const selectedIds = ref([active.value.id]);
const selected = computed(() => props.artboards.filter(board => selectedIds.value.includes(board.id)));
const targetHint = ref(''), notes = ref(''), includeSources = ref(true);
const dialog = ref<HTMLElement>(), upload = ref<HTMLInputElement>(), capture = ref<InstanceType<typeof DeliveryCapture>>();
const resultElement = ref<HTMLElement>();
const busy = ref(false), reading = ref(false), progress = ref(''), error = ref(''), warnings = ref<string[]>([]), completed = ref(false), copied = ref(false);
const sourceBoardId = ref(active.value.id);
const sourceBoard = computed(() => props.artboards.find(board => board.id === sourceBoardId.value) || active.value);
const source = computed(() => boardSource(sourceBoard.value));
watch([mode, selectedIds, targetHint, notes, includeSources, () => props.artboards], () => { completed.value = false; copied.value = false; });
let controller: AbortController | undefined, previousFocus: HTMLElement | null = null, disposed = false;
const prompt = computed(() => mode.value === 'update'
  ? '请阅读交付包中的 START_HERE.md，定位原工程页面，保留已有业务逻辑，按目标效果改造界面并验证。'
  : '请阅读交付包中的 START_HERE.md，检查工程环境，沿用已确认界面开发业务功能，区分示例数据与真实实现并完成验证。');
function select(id: string) { selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter(value => value !== id) : [...selectedIds.value, id]; completed.value = false; }
function close() { if (busy.value) controller?.abort(); else if (!reading.value) emit('close'); }
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); close(); }
  if (event.key !== 'Tab') return;
  const controls = [...(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="file"]), textarea:not(:disabled), select:not(:disabled), summary') || [])].filter(element => element.getClientRects().length);
  if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length - 1]?.focus(); }
  else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) { event.preventDefault(); controls[0]?.focus(); }
}
async function addSources(event: Event) {
  const input = event.target as HTMLInputElement, files = [...(input.files || [])]; input.value = '';
  if (!files.length) return;
  reading.value = true; error.value = ''; const board = sourceBoard.value;
  try {
    const additions = await Promise.all(files.map(readBuildAttachment));
    if (!disposed) emit('source', board.id, { ...boardSource(board), attachments: validateAttachments([...boardSource(board).attachments, ...additions]) });
  } catch (reason) { if (!disposed) error.value = reason instanceof Error ? reason.message : t('附件读取失败'); }
  finally { reading.value = false; }
}
function removeSource(id: string) { emit('source', sourceBoard.value.id, { ...source.value, attachments: source.value.attachments.filter(item => item.id !== id) }); }
async function deliver() {
  if (!selected.value.length || busy.value || reading.value) return;
  busy.value = true; error.value = ''; warnings.value = []; completed.value = false;
  const request = controller = new AbortController();
  try {
    const result = await createDeliveryArchive({ title: props.title, mode: mode.value, artboards: selected.value, activeArtboardId: props.activeId, targetHint: targetHint.value.trim(), notes: notes.value.trim(), includeSources: includeSources.value },
      { signal: request.signal, progress: message => { progress.value = message; }, capture: (board, signal) => capture.value!.capture(board, signal) });
    if (disposed || request.signal.aborted) return;
    downloadDelivery(result.name, result.archive); warnings.value = result.warnings; completed.value = true;
    await nextTick(); resultElement.value?.scrollIntoView({ block: 'nearest' }); resultElement.value?.focus({ preventScroll: true });
  } catch (reason) { if (!disposed && !request.signal.aborted) error.value = reason instanceof Error ? reason.message : t('交付包生成失败，请重试'); }
  finally { busy.value = false; controller = undefined; progress.value = ''; }
}
async function copyPrompt() {
  try { await navigator.clipboard.writeText(prompt.value); copied.value = true; }
  catch { error.value = t('无法复制，请手动选择下方交付指令'); }
}
onMounted(async () => { previousFocus = document.activeElement as HTMLElement | null; await nextTick(); dialog.value?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus(); });
onBeforeUnmount(() => { disposed = true; controller?.abort(); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); });
</script>

<template>
  <Teleport to="body">
    <div class="delivery-backdrop" @click.self="!busy && !reading && emit('close')">
      <section ref="dialog" class="delivery-dialog" role="dialog" aria-modal="true" aria-labelledby="delivery-title" @keydown.stop="keydown">
        <header class="delivery-header"><div><h2 id="delivery-title"><PackageCheck :size="23" />{{ t('交付开发') }}</h2><p>{{ t('把设计、资源和接入说明一起交给 AI，继续完成工程开发。') }}</p></div><button class="icon-button" :disabled="reading" :aria-label="busy ? t('取消打包') : t('关闭')" @click="close"><X :size="20" /></button></header>
        <div class="delivery-body">
          <fieldset :disabled="busy || reading">
            <div class="delivery-modes" :aria-label="t('选择交付场景')">
              <button type="button" :class="{ active: mode === 'update' }" :aria-pressed="mode === 'update'" @click="mode = 'update'; completed = false"><RefreshCw :size="20" /><span><strong>{{ t('优化已有页面') }}</strong><small>{{ t('保留原工程业务，按新设计调整界面') }}</small></span><Check v-if="mode === 'update'" :size="17" /></button>
              <button type="button" :class="{ active: mode === 'new' }" :aria-pressed="mode === 'new'" @click="mode = 'new'; completed = false"><Rocket :size="20" /><span><strong>{{ t('开发新功能') }}</strong><small>{{ t('沿用已确认界面，补齐环境与业务功能') }}</small></span><Check v-if="mode === 'new'" :size="17" /></button>
            </div>
            <div class="delivery-section-heading"><h3>{{ t('交付页面') }}</h3><button v-if="artboards.length > 1" class="delivery-text-button" type="button" @click="selectedIds = selectedIds.length === artboards.length ? [activeId] : artboards.map(board => board.id)">{{ selectedIds.length === artboards.length ? t('仅当前页面') : t('选择全部') }}</button></div>
            <div class="delivery-pages"><label v-for="board in artboards" :key="board.id"><input type="checkbox" :checked="selectedIds.includes(board.id)" @change="select(board.id)" /><span>{{ board.title }}</span><small v-if="board.id === activeId">{{ t('当前页面') }}</small></label></div>
            <label class="delivery-field">{{ t('页面名称或访问路径（选填）') }}<input v-model="targetHint" maxlength="300" :placeholder="t('例如：用户报事 /work-orders/create，帮助 AI 定位页面')" /></label>
            <label class="delivery-field">{{ mode === 'update' ? t('改造补充（选填）') : t('开发补充（选填）') }}<textarea v-model="notes" rows="3" maxlength="5000" :placeholder="mode === 'update' ? t('例如：仅调整布局和样式，保留原有提交和审批流程') : t('例如：接入报事接口，补充必填校验、提交中和失败状态')" /></label>
            <div class="delivery-section-heading"><h3>{{ t('原始截图与需求') }}</h3><label class="delivery-inline-check"><input v-model="includeSources" type="checkbox" />{{ t('包含原始输入') }}</label></div>
            <div class="delivery-source-box" :class="{ muted: !includeSources }">
              <label v-if="artboards.length > 1" class="delivery-field">{{ t('查看或补充来源页面') }}<select v-model="sourceBoardId"><option v-for="board in artboards" :key="board.id" :value="board.id">{{ board.title }}</option></select></label>
              <p v-if="source.prompt" class="delivery-original-prompt">{{ source.prompt }}</p>
              <div v-for="item in source.attachments" :key="item.id" class="delivery-attachment"><img v-if="item.kind === 'image'" :src="item.content" alt="" /><FileText v-else :size="20" /><span><strong>{{ item.name }}</strong><small>{{ formatAttachmentSize(item.size) }}</small></span><button type="button" class="icon-button" :aria-label="t('移除附件：{0}', [item.name])" @click="removeSource(item.id)"><X :size="15" /></button></div>
              <p v-if="!source.prompt && !source.attachments.length" class="delivery-help">{{ t('此历史页面未保存原始输入。可补充原页面截图或需求文档，帮助 AI 准确理解任务。') }}</p>
              <button type="button" class="delivery-add-source" @click="upload?.click()"><Plus :size="15" />{{ t('补充截图或需求文档') }}</button>
              <input ref="upload" type="file" hidden multiple :accept="`${IMAGE_ACCEPT},${DOCUMENT_ACCEPT}`" @change="addSources" />
              <p class="delivery-help">{{ t('支持 PNG / JPG / WebP、Markdown / TXT 和代码文档。附件会随设计保存；导出前请检查敏感信息，不勾选时不会包含原始输入。') }}</p>
            </div>
            <div class="delivery-package-summary"><Image :size="18" /><p><strong>{{ t('一个 ZIP，完整交付') }}</strong><span>{{ t('包含页面代码、设计 JSON、效果图、可访问的图片资源、需求待办和 AI 接入说明；另附同渲染器参考预览。') }}</span></p></div>
            <details class="delivery-advanced"><summary>{{ t('高级导出') }}</summary><div><button type="button" @click="emit('advanced', 'vue')">{{ t('Vue 单文件组件') }}</button><button type="button" @click="emit('advanced', 'json')">{{ t('设计 JSON') }}</button><button type="button" @click="emit('advanced', 'md')">{{ t('组件说明文档') }}</button></div><p class="delivery-help">{{ t('高级导出保留当前文档的全部画板；ZIP 按上方所选页面打包。') }}</p></details>
          </fieldset>
          <p v-if="error" class="delivery-error" role="alert">{{ error }}</p>
          <div v-if="completed" ref="resultElement" tabindex="-1" class="delivery-result" role="status"><strong><Check :size="17" />{{ t('交付包已生成') }}</strong><p>{{ t('解压到目标工程后，把下方指令发给 Codex 或其他 IDE 的 AI。下载不代表工程已完成接入。') }}</p><p class="delivery-copy-prompt">{{ prompt }}</p><button class="toolbar-button" @click="copyPrompt"><Copy :size="14" />{{ copied ? t('已复制') : t('复制交付指令') }}</button><ul v-if="warnings.length"><li v-for="warning in warnings" :key="warning">{{ warning }}</li></ul></div>
        </div>
        <footer class="delivery-footer"><p aria-live="polite">{{ busy ? t(progress) : t('保留业务逻辑 · 检查依赖再接入 · 不覆盖工程配置') }}</p><button class="toolbar-button" :disabled="reading" @click="close">{{ busy ? t('取消打包') : t('关闭') }}</button><AsyncButton class="primary-toolbar-button" :disabled="!selected.length || busy || reading" :loading="busy || reading" @click="deliver"><Download :size="16" />{{ busy ? t('正在打包') : t('下载交付包') }}<ArrowRight :size="15" /></AsyncButton></footer>
      </section>
    </div>
    <DeliveryCapture ref="capture" />
  </Teleport>
</template>

<style scoped>
.delivery-backdrop { position: fixed; inset: 0; z-index: 160; background: #080c1280; backdrop-filter: blur(5px); display: grid; place-items: center; padding: 24px; }
.delivery-dialog { width: min(760px, 100%); max-height: calc(100dvh - 48px); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--ui-border-strong, var(--line)); border-radius: 16px; background: var(--panel); color: var(--text); box-shadow: 0 24px 80px #0005; font-size: 14px; }
.delivery-header { display: flex; gap: 20px; align-items: flex-start; padding: 24px 26px 20px; border-bottom: 1px solid var(--line); }
.delivery-header > div { flex: 1; }.delivery-header h2 { margin: 0; display: flex; gap: 10px; align-items: center; font-size: 21px; }.delivery-header h2 svg { color: var(--accent); }
.delivery-header p { color: var(--text-3); margin: 10px 0 0; font-size: 13px; line-height: 1.6; }
.delivery-body { overflow-y: auto; padding: 22px 26px; overscroll-behavior: contain; }.delivery-body fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }.delivery-body fieldset:disabled { opacity: .65; }
.delivery-modes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.delivery-modes button { display: flex; align-items: flex-start; gap: 10px; padding: 16px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2); color: var(--text-2); text-align: left; cursor: pointer; }.delivery-modes button.active { border-color: var(--accent); background: var(--accent-soft); color: var(--text); }.delivery-modes button > svg { flex: none; color: var(--accent); }.delivery-modes button span { flex: 1; }.delivery-modes strong { font-size: 15px; }.delivery-modes small { display: block; margin-top: 7px; line-height: 1.6; color: var(--text-3); font-size: 12px; }
.delivery-section-heading { display: flex; justify-content: space-between; gap: 14px; align-items: center; margin: 23px 0 11px; }.delivery-section-heading h3 { margin: 0; font-size: 14px; }.delivery-text-button { border: 0; padding: 0; color: var(--accent-text); background: transparent; cursor: pointer; font-size: 12px; }
.delivery-pages { display: grid; gap: 6px; max-height: 150px; overflow-y: auto; }.delivery-pages label { display: flex; align-items: center; gap: 9px; padding: 10px 12px; border-radius: 7px; background: var(--panel-2); cursor: pointer; }.delivery-pages span { flex: 1; }.delivery-pages small { font-size: 12px; color: var(--text-3); }input[type="checkbox"] { accent-color: var(--accent); width: 15px; height: 15px; flex: none; }
.delivery-field { display: flex; flex-direction: column; gap: 9px; margin: 20px 0 0; font-size: 13px; color: var(--text-2); }.delivery-field input,.delivery-field textarea,.delivery-field select { width: 100%; min-width: 0; border: 1px solid var(--line); border-radius: 7px; padding: 10px 12px; background: var(--panel-2); color: var(--text); font: inherit; line-height: 1.6; }.delivery-field textarea { resize: vertical; min-height: 78px; }
.delivery-inline-check { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-2); cursor: pointer; }.delivery-source-box { border: 1px solid var(--line); border-radius: 9px; padding: 14px; }.delivery-source-box.muted { opacity: .6; }.delivery-source-box .delivery-field { margin: 0 0 12px; }.delivery-original-prompt { margin: 0 0 12px; max-height: 96px; overflow-y: auto; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text-2); font-size: 12px; line-height: 1.6; }
.delivery-attachment { display: flex; align-items: center; gap: 10px; padding: 8px; margin-bottom: 6px; border-radius: 7px; background: var(--panel-2); }.delivery-attachment img { width: 42px; height: 42px; object-fit: cover; border-radius: 4px; }.delivery-attachment > span { min-width: 0; flex: 1; }.delivery-attachment strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; font-size: 12px; }.delivery-attachment small { display: block; margin-top: 4px; color: var(--text-3); font-size: 12px; }
.delivery-add-source { display: inline-flex; align-items: center; gap: 6px; padding: 8px 10px; border: 1px dashed var(--line); background: var(--panel-2); color: var(--text-2); border-radius: 6px; cursor: pointer; font: inherit; font-size: 12px; }.delivery-help { margin: 10px 0 0; color: var(--text-3); font-size: 12px; line-height: 1.7; }
.delivery-package-summary { display: flex; gap: 10px; padding: 14px; margin-top: 18px; border-radius: 8px; background: var(--panel-2); }.delivery-package-summary svg { color: var(--accent); flex: none; }.delivery-package-summary p { margin: 0; }.delivery-package-summary strong { display: block; font-size: 13px; }.delivery-package-summary span { display: block; margin-top: 7px; font-size: 12px; color: var(--text-3); line-height: 1.7; }
.delivery-advanced { margin-top: 18px; }.delivery-advanced summary { color: var(--text-3); cursor: pointer; font-size: 12px; }.delivery-advanced > div { display: flex; gap: 8px; margin-top: 12px; }.delivery-advanced button { border: 1px solid var(--line); border-radius: 5px; padding: 7px 10px; background: var(--panel-2); color: var(--text-2); font-size: 12px; cursor: pointer; }
.delivery-error { padding: 12px; color: var(--danger); border: 1px solid var(--danger); border-radius: 7px; font-size: 13px; overflow-wrap: anywhere; }.delivery-result { padding: 16px; margin-top: 20px; background: var(--accent-soft); border: 1px solid var(--accent); border-radius: 9px; }.delivery-result > strong { display: flex; align-items: center; gap: 6px; }.delivery-result p,.delivery-result li { color: var(--text-2); font-size: 12px; line-height: 1.8; }.delivery-copy-prompt { user-select: text; padding: 10px; border: 1px solid var(--line); border-radius: 5px; background: var(--panel); }.delivery-result ul { padding-left: 18px; margin-bottom: 0; }
.delivery-footer { flex: none; display: flex; align-items: center; gap: 10px; padding: 16px 26px; border-top: 1px solid var(--line); }.delivery-footer p { flex: 1; margin: 0; font-size: 12px; color: var(--text-3); line-height: 1.6; }.delivery-footer button { flex: none; }.delivery-footer button:disabled { cursor: not-allowed; }
@media(max-width: 650px) { .delivery-backdrop { padding: 12px; }.delivery-dialog { max-height: calc(100dvh - 24px); }.delivery-header,.delivery-body,.delivery-footer { padding: 16px; }.delivery-modes { grid-template-columns: 1fr; }.delivery-footer { flex-wrap: wrap; }.delivery-footer p { flex-basis: 100%; } }
</style>
