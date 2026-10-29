<script setup lang="ts">
import AsyncButton from './components/AsyncButton.vue';
import { useNotifications } from './utils/notifications';
import { useI18n, componentName, formatDate } from './utils/i18n';
const { t } = useI18n();
import LanguageToggle from './components/LanguageToggle.vue';
import ThemeToggle from './components/ThemeToggle.vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  ArrowLeft,
  ChevronDown,
  Code2,
  Download,
  FileJson,
  FileText,
  MonitorSmartphone,
  Play,
  Redo2,
  Save,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-vue-next';
import { Dialog } from 'persagy-vant';
import ComponentLibrary from './components/ComponentLibrary.vue';
import GenerationLoading from './components/GenerationLoading.vue';
import PhoneCanvas from './components/PhoneCanvas.vue';
import PropertyPanel from './components/PropertyPanel.vue';
import DraftRecoveryDialog from './components/DraftRecoveryDialog.vue';
import { createDesignAutosave, type AutosaveState } from './utils/designAutosave';
import type { DesignDraft } from './utils/designDrafts';
import { createNode, getDefinition, makeId } from './data/componentCatalog';
import type { CanvasNode, ComponentType, ContainerExtensions, PageBuildReport, PageBuildRequest, SavedDesign } from './types';
import { extensionTreeError, updateContainerExtensions } from './utils/containerExtensions';
import { downloadText, toJson, toMarkdown, toVueSfc } from './utils/exportDesign';
import { generatePageFromPrompt } from './utils/pageGenerator';
import { generatePageWithAi } from './utils/aiClient';
import { bindPanel, removeAssociatedPanel } from './utils/panelInteractions';
import { isCanvasPanel } from './utils/canvasPresentation';
import { associatedPanelEdit, selectionInPanelEdit, validPanelEdit, type AssociatedPanelEdit } from './utils/associatedPanelEditing';
import { applyComponentStyle, patchChangesComponentStyle } from './utils/componentStyles';
import {
  canGroupNodes, canHaveChildren, cloneNodes, containsNode, duplicateNodes, findNode, flattenNodes,
  groupNodes, isContainer, moveNode, removeNodes, selectionRoots, ungroupNode,
} from './utils/nodeTree';

const props = defineProps<{ cloudDesign: SavedDesign; ownerId: string; pageId: string; saveCloud: (document: SavedDesign, signal?: AbortSignal) => Promise<string>; saveCopy: (document: SavedDesign) => Promise<string> }>();
const emit = defineEmits<{ (event: 'back'): void; (event: 'open-copy', id: string): void }>();

const urlParams = new URLSearchParams(location.search);
const previewPayload = urlParams.get('data');
const zoom = ref(100);
const editorCanvas = ref<InstanceType<typeof PhoneCanvas>>();
const selectedIds = ref<string[]>([]);
const associatedEdits = ref<AssociatedPanelEdit[]>([]);
const associatedEdit = computed(() => associatedEdits.value[associatedEdits.value.length - 1]);
const fileTitle = ref('移动端巡检页面');
const nodes = ref<CanvasNode[]>([]);
const autosaveState = ref<AutosaveState>();
const copying = ref(false);
const saving = computed(() => !!autosaveState.value?.saving || copying.value);
const saveState = computed(() => autosaveState.value?.status || 'saved');
const generating = ref(false);
const generationError = ref('');
let generationController: AbortController | undefined;
const exportOpen = ref(false);
const clearDialogOpen = ref(false);
const ConfirmDialog = Dialog.Component;
const { notify } = useNotifications();
const preparingPreview = ref(false);
const buildReport = ref<PageBuildReport | undefined>();
const isPreview = ref(urlParams.get('preview') === '1' || location.hash === '#preview');

const saved = props.cloudDesign;
let queryDesign: Pick<SavedDesign, 'title' | 'nodes' | 'report'> | null = null;
try {
  queryDesign = previewPayload ? (JSON.parse(previewPayload) as Pick<SavedDesign, 'title' | 'nodes'>) : null;
} catch {
  queryDesign = null;
}

if (Array.isArray(queryDesign?.nodes)) {
  fileTitle.value = queryDesign.title;
  nodes.value = cloneNodes(queryDesign.nodes);
  buildReport.value = queryDesign.report;
} else if (Array.isArray(saved?.nodes)) {
  fileTitle.value = saved.title;
  nodes.value = cloneNodes(saved.nodes);
  buildReport.value = saved.report;
} else {
  const initial = generatePageFromPrompt('巡检任务列表');
  fileTitle.value = initial.title;
  nodes.value = initial.nodes;
  buildReport.value = initial.report;
}

function currentDocument(): SavedDesign {
  return { version: 1, title: fileTitle.value, nodes: cloneNodes(nodes.value), report: buildReport.value, updatedAt: new Date().toISOString() };
}
// URL fixtures and interactive previews must never write into a real document.
const persistenceEnabled = !isPreview.value && !queryDesign;
const draftWriterId = makeId();
const autosave = createDesignAutosave({
  ownerId: props.ownerId, pageId: props.pageId, writerId: draftWriterId,
  initial: { ...currentDocument(), updatedAt: props.cloudDesign.updatedAt }, enabled: persistenceEnabled,
  storage: () => window.localStorage, online: () => navigator.onLine,
  save: (document, signal) => props.saveCloud(document, signal),
  publish: state => { autosaveState.value = state; },
});
const draftsOpen = ref(autosaveState.value?.status === 'recovery');
const hasStoredDrafts = computed(() => autosaveState.value?.drafts.some(draft => draft.writerId !== draftWriterId));
const saveStatusHint = computed(() => {
  const state = autosaveState.value!;
  const lines = [t('停止编辑 2 秒后自动保存；连续编辑最多 30 秒保存一次。本机草稿仅保存在当前浏览器。')];
  if (Number.isFinite(Date.parse(state.savedAt))) lines.push(t('最近同步：{0}', [formatDate(state.savedAt, { hour: '2-digit', minute: '2-digit', second: '2-digit' })]));
  if (state.localAt) lines.push(t('本机草稿：{0}', [formatDate(state.localAt, { hour: '2-digit', minute: '2-digit', second: '2-digit' })]));
  return lines.join('\n');
});
const saveStatusLabel = computed(() => {
  const state = autosaveState.value!;
  if (!persistenceEnabled) return t('临时预览 · 不自动保存');
  if (state.dirty && state.localError) return t('本机备份失败');
  if (state.status === 'saved') return t(state.online ? '云端已保存' : '离线 · 云端已保存');
  if (state.status === 'saving') return t('正在自动保存');
  if (state.status === 'recovery') return t('待确认本机草稿');
  if (state.status === 'conflict') return t('版本冲突 · 草稿已保留');
  if (state.status === 'offline') return t(state.localSaved ? '离线 · 已存本机' : '离线 · 尚未保存');
  if (state.status === 'error') return t(state.localSaved ? '同步失败 · 已存本机' : '同步失败');
  return t(state.localSaved ? '已存本机 · 待同步' : '等待自动保存');
});
const saveNotice = computed(() => {
  const state = autosaveState.value!;
  if (state.localError) return state.localError;
  if (state.status === 'offline') return '当前离线，修改已保存在本机。保持此页面打开，联网后会自动同步。';
  return ['error', 'conflict'].includes(state.status) ? state.error : '';
});
watch(() => JSON.stringify({ title: fileTitle.value, nodes: nodes.value, report: buildReport.value }), () => {
  if (!isPreview.value) autosave.update(currentDocument());
});
watch(isPreview, value => autosave.setEnabled(persistenceEnabled && !value));
function syncCurrentDraft() { if (!isPreview.value) { autosave.update(currentDocument()); autosave.persist(); } }
function reviewDrafts() { autosave.reviewDrafts(); draftsOpen.value = true; }
function keepCurrentDraft() { draftsOpen.value = false; autosave.keepCurrent(); }
function restoreDraft(id: string) {
  const draft = autosave.restore(id);
  if (!draft) return;
  commit(draft.nodes, [], draft.report, draft.title);
  draftsOpen.value = false;
  showToast('已恢复本机草稿');
}
function downloadDraft(draft?: DesignDraft) {
  const document = draft?.document || currentDocument();
  const title = document.title.replace(/[\\/:*?"<>|]/g, '-') || 'design';
  downloadText(`${title}-draft.json`, toJson(document.title, document.nodes, document.report), 'application/json;charset=utf-8');
}
async function saveConflictCopy() {
  if (saving.value || generating.value || !navigator.onLine) return;
  syncCurrentDraft(); copying.value = true;
  const document = autosave.getDocument();
  try {
    const id = await props.saveCopy(document);
    if (!autosave.finishCopy(document)) { showToast('副本已保存，期间的新修改仍保留在本机', 'error'); return; }
    showToast('已另存为云端副本'); emit('open-copy', id);
  } catch (error) { showToast(error instanceof Error ? error.message : '另存副本失败，本机草稿仍保留', 'error'); }
  finally { copying.value = false; }
}

const history = ref([{ title: fileTitle.value, nodes: cloneNodes(nodes.value), selectedIds: [] as string[], report: buildReport.value }]);
const historyIndex = ref(0);
const canUndo = computed(() => historyIndex.value > 0);
const canRedo = computed(() => historyIndex.value < history.value.length - 1);
const selectedNodes = computed(() => selectionRoots(nodes.value, selectedIds.value));
const selectedNode = computed(() => selectedNodes.value.length === 1 ? selectedNodes.value[0] : null);
const selectedLocation = computed(() => selectedNode.value ? findNode(nodes.value, selectedNode.value.id) : null);
const selectedIndex = computed(() => selectedLocation.value?.index ?? -1);
const canGroup = computed(() => canGroupNodes(nodes.value, selectedIds.value));
const componentCount = computed(() => flattenNodes(nodes.value).filter((node) => !isContainer(node)).length);
const editingPanel = computed(() => associatedEdit.value ? findNode(nodes.value, associatedEdit.value.targetId)?.node : null);

function editAssociatedPanel(event: string) {
  if (!selectedNode.value) return;
  const edit = associatedPanelEdit(nodes.value, selectedNode.value.id, event);
  if (!edit) { showToast('关联组件已不可用，请重新选择', 'error'); return; }
  associatedEdits.value.push(edit);
  selectedIds.value = [edit.targetId];
}

function exitAssociatedEdit() {
  const edit = associatedEdits.value.pop();
  if (!edit) return;
  selectedIds.value = findNode(nodes.value, edit.sourceId) ? [edit.sourceId] : [];
}

watch(() => [nodes.value, selectedIds.value], () => {
  while (associatedEdit.value) {
    const edit = associatedEdit.value;
    if (!validPanelEdit(nodes.value, edit)) { exitAssociatedEdit(); continue; }
    if (selectionInPanelEdit(nodes.value, edit, selectedIds.value)) break;
    associatedEdits.value.pop();
  }
});

function selectNode(id: string | null, additive = false) {
  if (!id) { selectedIds.value = []; return; }
  const clicked = findNode(nodes.value, id)?.node;
  if (!clicked) return;
  if (!additive) { selectedIds.value = [id]; return; }
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter((item) => item !== id);
    return;
  }
  selectedIds.value = [...selectedIds.value.filter((item) => {
    const existing = findNode(nodes.value, item)?.node;
    return existing && !containsNode(existing, id) && !containsNode(clicked, item);
  }), id];
}

function selectLayers(ids: string[]) {
  selectedIds.value = selectionRoots(nodes.value, ids).map((node) => node.id);
}

function showToast(message: string, kind: 'success' | 'error' = 'success') { notify(message, kind); }

function clearCanvas() {
  if (!nodes.value.length) return;
  commit([], []);
  exportOpen.value = false;
  showToast('画板已清空，可通过撤销恢复');
}

function commit(next: CanvasNode[], nextSelection: string[] = selectedIds.value, report?: PageBuildReport, title = fileTitle.value) {
  history.value[historyIndex.value].selectedIds = [...selectedIds.value];
  history.value[historyIndex.value].title = fileTitle.value;
  fileTitle.value = title;
  nodes.value = cloneNodes(next);
  buildReport.value = report;
  selectedIds.value = selectionRoots(nodes.value, nextSelection).map((node) => node.id);
  if (historyIndex.value < history.value.length - 1) history.value.splice(historyIndex.value + 1);
  history.value.push({ title, nodes: cloneNodes(next), selectedIds: [...selectedIds.value], report });
  if (history.value.length > 60) history.value.shift();
  historyIndex.value = history.value.length - 1;
}

function addNode(type: ComponentType, index = nodes.value.length, parentId: string | null = null) {
  const node = createNode(type);
  const next = cloneNodes(nodes.value);
  const parent = parentId ? findNode(next, parentId)?.node : null;
  if (parentId && (!parent || !canHaveChildren(parent))) return;
  const siblings = parent ? (parent.children ||= []) : next;
  siblings.splice(Math.max(0, Math.min(index, siblings.length)), 0, node);
  commit(next, [node.id]);
}

function patchNode(id: string, patch: Record<string, unknown>) {
  const next = cloneNodes(nodes.value);
  const node = findNode(next, id)?.node;
  if (!node) return;
  if (patchChangesComponentStyle(node, patch)) delete node.styleId;
  // Fixed navigation should reserve its original space unless explicitly overridden.
  if (node.type === 'nav-bar' && patch.fixed === true) node.props.placeholder = true;
  Object.assign(node.props, patch);
  commit(next, [id]);
}

function patchSelected(patch: Record<string, unknown>) {
  if (selectedNode.value) patchNode(selectedNode.value.id, patch);
}

function selectComponentStyle(id: string) {
  if (!selectedNode.value) return;
  const next = cloneNodes(nodes.value);
  const location = findNode(next, selectedNode.value.id);
  if (!location) return;
  const styled = applyComponentStyle(location.node, id);
  if (!styled) return;
  location.siblings.splice(location.index, 1, styled);
  commit(next, [styled.id]);
}

function patchExtensions(extensions: ContainerExtensions) {
  if (!selectedNode.value) return;
  const next = updateContainerExtensions(nodes.value, selectedNode.value.id, extensions);
  if (!next) { showToast('父子容器不能重复启用同类扩展，请先关闭已有扩展', 'error'); return; }
  commit(next);
}

function linkPanel(event: string, targetId: string, type?: string) {
  if (!selectedNode.value) return;
  linkPanelFor(selectedNode.value.id, event, targetId, type);
}

function linkPanelFor(sourceId: string, event: string, targetId: string, type?: string) {
  if (type && !isCanvasPanel({ type } as CanvasNode)) { showToast(`「${componentName(getDefinition(type))}」不支持关联，请点击虚线框选择支持的控件`, 'error'); return; }
  const currentTarget = findNode(nodes.value, sourceId)?.node.actions?.[event]?.targetId || '';
  const created = type ? createNode(type, { show: false }) : undefined;
  if (created && canHaveChildren(created)) created.children = [];
  const next = bindPanel(nodes.value, sourceId, event, created?.id || targetId, created);
  if (!next) { showToast('此控件不支持关联，请点击虚线框选择支持的控件', 'error'); return; }
  if (!type && currentTarget === targetId) return;
  commit(next, [sourceId]);
  showToast(created ? '已创建面板并关联，可在预览中点击触发' : targetId ? '已关联面板' : '已解除关联，面板组件保留');
}

function removeAssociated(event: string) {
  const source = selectedNode.value;
  if (!source) return;
  const next = removeAssociatedPanel(nodes.value, source.id, event);
  if (!next) return;
  const deleted = flattenNodes(next).length < flattenNodes(nodes.value).length;
  commit(next, [source.id]);
  showToast(deleted ? '已删除关联控件及对应图层，可通过撤销恢复' : '已清除失效关联');
}

function updateContent(content: string) {
  const next = cloneNodes(nodes.value);
  const node = selectedNode.value ? findNode(next, selectedNode.value.id)?.node : null;
  if (!node) return;
  node.content = content;
  commit(next, [node.id]);
}

function removeSelected() {
  if (!selectedIds.value.length) return;
  commit(removeNodes(nodes.value, selectedIds.value), []);
}

function duplicateSelected() {
  if (!selectedIds.value.length) return;
  const result = duplicateNodes(nodes.value, selectedIds.value, makeId);
  commit(result.nodes, result.selectedIds);
}

function moveSelected(direction: -1 | 1) {
  const location = selectedLocation.value;
  if (!location || location.index + direction < 0 || location.index + direction >= location.siblings.length) return;
  reorder(location.node.id, location.index + (direction === 1 ? 2 : -1), location.parentId);
}

function reorder(id: string, targetIndex: number, parentId: string | null = null) {
  const next = moveNode(nodes.value, id, targetIndex, parentId);
  if (!next) { showToast('不能把容器移入自身或它的子图层'); return; }
  const conflict = extensionTreeError(next);
  if (conflict) { showToast(conflict, 'error'); return; }
  if (JSON.stringify(next) !== JSON.stringify(nodes.value)) commit(next, [id]);
}

function createGroup() {
  const result = groupNodes(nodes.value, selectedIds.value, makeId());
  if (!result) { showToast('请选择一个图层或同一层级的多个图层'); return; }
  commit(result.nodes, [result.group.id]);
  showToast(`已将 ${result.group.children?.length} 个图层创建为容器组`);
}

function ungroup() {
  if (!selectedNode.value) return;
  const result = ungroupNode(nodes.value, selectedNode.value.id);
  if (!result) return;
  commit(result.nodes, result.childIds);
  showToast('已解组，子图层保留在原位置');
}

function undo() {
  if (!canUndo.value) return;
  history.value[historyIndex.value].title = fileTitle.value;
  historyIndex.value -= 1;
  fileTitle.value = history.value[historyIndex.value].title;
  nodes.value = cloneNodes(history.value[historyIndex.value].nodes);
  buildReport.value = history.value[historyIndex.value].report;
  selectedIds.value = [...history.value[historyIndex.value].selectedIds];
}

function redo() {
  if (!canRedo.value) return;
  history.value[historyIndex.value].title = fileTitle.value;
  historyIndex.value += 1;
  fileTitle.value = history.value[historyIndex.value].title;
  nodes.value = cloneNodes(history.value[historyIndex.value].nodes);
  buildReport.value = history.value[historyIndex.value].report;
  selectedIds.value = [...history.value[historyIndex.value].selectedIds];
}

async function saveDesign(notify = true): Promise<boolean> {
  syncCurrentDraft();
  const success = await autosave.retry();
  if (notify) showToast(success ? '已保存到云端' : autosaveState.value?.error || (autosaveState.value?.localSaved ? '草稿已存本机，联网后继续同步' : '暂未保存，请导出备份'), success ? 'success' : 'error');
  return success;
}

async function openPreview() {
  if (saving.value || preparingPreview.value) return;
  preparingPreview.value = true;
  const preview = window.open('about:blank', '_blank');
  if (preview) preview.opener = null;
  try {
    if (await saveDesign(false)) {
      const target = `${location.origin}/?page=${props.pageId}&preview=1`;
      if (preview) preview.location.replace(target);
      else showToast('预览窗口被拦截，请允许浏览器弹出窗口后重试', 'error');
    } else preview?.close();
  } finally { preparingPreview.value = false; }
}

async function returnToPages() {
  if (saving.value) { showToast('正在保存，请稍候'); return; }
  syncCurrentDraft();
  if (autosaveState.value?.dirty && navigator.onLine && !generating.value) await autosave.flush();
  if ((autosaveState.value?.dirty || generating.value) && !window.confirm(t(autosaveState.value?.localSaved ? '当前修改尚未同步云端，本机草稿已保留。确认返回我的页面？' : '当前修改尚未保存或正在生成，请先导出备份。确认返回我的页面？'))) return;
  emit('back');
}

function beforeUnload(event: BeforeUnloadEvent) {
  syncCurrentDraft();
  if (isPreview.value || (!autosaveState.value?.dirty && !generating.value)) return;
  event.preventDefault(); event.returnValue = '';
}
function onConnectivity() { autosave.connectivityChanged(); }
function onVisibilityChange() { if (document.visibilityState === 'hidden') { syncCurrentDraft(); void autosave.flush(); } }
function onStorage(event: StorageEvent) { if (event.key?.startsWith('compose:design-draft:v1:')) autosave.refresh(); }

function cancelGeneration() {
  generationController?.abort();
}

async function generate(request: PageBuildRequest) {
  if (generating.value) return;
  generating.value = true;
  generationError.value = '';
  const controller = new AbortController();
  generationController = controller;
  const startingCanvas = JSON.stringify(nodes.value);
  const startingTitle = fileTitle.value;
  try {
    const generated = await generatePageWithAi(request, controller.signal);
    if (controller.signal.aborted) return;
    if (JSON.stringify(nodes.value) !== startingCanvas || fileTitle.value !== startingTitle) throw new Error('生成期间画板已修改，本次结果未覆盖画板。请重新生成。');
    commit(generated.nodes, generated.nodes[0] ? [generated.nodes[0].id] : [], generated.report, generated.title);
    if (generated.summary) notify(generated.summary, 'info');
    showToast(`已生成「${generated.title}」`);
  } catch (error) {
    if (controller.signal.aborted) showToast('已取消生成');
    else { generationError.value = error instanceof Error ? error.message : '页面构建失败，请检查需求与配方。'; showToast(generationError.value, 'error'); }
  } finally { generating.value = false; generationController = undefined; }
}

function setZoom(next: number) {
  zoom.value = Math.max(50, Math.min(150, next));
}

function exportFile(kind: 'vue' | 'json' | 'md') {
  const safeName = fileTitle.value.replace(/[\\/:*?"<>|]/g, '-') || 'mobile-page';
  if (kind === 'vue') downloadText(`${safeName}.vue`, toVueSfc(fileTitle.value, nodes.value), 'text/plain;charset=utf-8');
  if (kind === 'json') downloadText(`${safeName}.json`, toJson(fileTitle.value, nodes.value, buildReport.value), 'application/json;charset=utf-8');
  if (kind === 'md') downloadText(t('{0}-组件说明.md', [safeName]), toMarkdown(fileTitle.value, nodes.value, buildReport.value), 'text/markdown;charset=utf-8');
  exportOpen.value = false;
  showToast('导出文件已生成');
}

function onKeydown(event: KeyboardEvent) {
  if (clearDialogOpen.value) return;
  const target = event.target as HTMLElement;
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
  const command = event.metaKey || event.ctrlKey;

  if (command && event.key.toLowerCase() === 's') {
    event.preventDefault();
    saveDesign();
  } else if (command && event.key.toLowerCase() === 'z' && event.shiftKey) {
    event.preventDefault();
    redo();
  } else if (command && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    undo();
  } else if (command && event.key.toLowerCase() === 'd' && !editing) {
    event.preventDefault();
    duplicateSelected();
  } else if (command && event.key.toLowerCase() === 'g' && !editing) {
    event.preventDefault();
    if (event.shiftKey) ungroup();
    else createGroup();
  } else if (event.key === 'Escape' && !editing) {
    if (associatedEdit.value) exitAssociatedEdit();
    else selectNode(null);
  } else if (command && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    (document.querySelector('.search-box input') as HTMLInputElement | null)?.focus();
  } else if (!editing && (event.key === 'Backspace' || event.key === 'Delete')) {
    event.preventDefault();
    removeSelected();
  }
}

function onHashChange() {
  isPreview.value = new URLSearchParams(location.search).get('preview') === '1' || location.hash === '#preview';
}

function exitPreview() {
  location.href = `${location.origin}/?page=${props.pageId}`;
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('beforeunload', beforeUnload);
  window.addEventListener('online', onConnectivity);
  window.addEventListener('offline', onConnectivity);
  window.addEventListener('pagehide', syncCurrentDraft);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('storage', onStorage);
});

onBeforeUnmount(() => {
  syncCurrentDraft(); autosave.dispose();
  generationController?.abort();
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('hashchange', onHashChange);
  window.removeEventListener('beforeunload', beforeUnload);
  window.removeEventListener('online', onConnectivity);
  window.removeEventListener('offline', onConnectivity);
  window.removeEventListener('pagehide', syncCurrentDraft);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('storage', onStorage);
});
</script>

<template>
  <main v-if="isPreview" class="preview-page">
    <div class="preview-chrome">
      <div class="brand-mark small" role="img" aria-label="Compose"><span>C</span></div>
      <div><strong>{{ fileTitle }}</strong><span>{{ t('交互预览 · {0} 个组件', [componentCount]) }}</span></div>
      <div class="surface-controls"><ThemeToggle /><LanguageToggle /></div><button @click="exitPreview">{{ t("返回编辑器") }}</button>
    </div>
    <div class="preview-canvas">
      <PhoneCanvas :nodes="nodes" preview :zoom="100" @patch="patchNode" @action="showToast" />
    </div>
  </main>

  <main v-else class="designer-shell">
    <header class="topbar" :inert="copying ? '' : undefined">
      <div class="topbar-left">
        <button class="editor-back" :title="t('我的页面')" :aria-label="t('返回我的页面')" @click="returnToPages"><ArrowLeft :size="17" /></button>
        <div class="brand-mark" role="img" aria-label="Compose"><span>C</span></div>
        <div class="document-title">
          <input v-model="fileTitle" :aria-label="t('文件名称')" maxlength="100" />
          <span role="status" :title="saveStatusHint">
            <i :class="saveState" />
            {{ saveStatusLabel }}
            <button v-if="persistenceEnabled && hasStoredDrafts" class="draft-history-button" :disabled="saving" :aria-label="t('查看本机草稿')" @click="reviewDrafts">{{ t('本机草稿') }}</button>
          </span>
        </div>
      </div>

      <div class="topbar-center">
        <button :disabled="!canUndo" :title="t('撤销 ⌘Z')" @click="undo"><Undo2 :size="16" /></button>
        <button :disabled="!canRedo" :title="t('重做 ⇧⌘Z')" @click="redo"><Redo2 :size="16" /></button>
        <span class="toolbar-divider" />
        <span class="device-label"><MonitorSmartphone :size="15" /> iPhone 14 · 390 × 844</span>
      </div>

      <div class="topbar-right">
        <div class="surface-controls"><ThemeToggle /><LanguageToggle /></div>
        <button class="toolbar-button clear-canvas-button" :disabled="!nodes.length" :aria-label="t('清空画板')" :title="t('清空画板')" @click="clearDialogOpen = true"><Trash2 :size="15" /> {{ t("清空画板") }}</button>
        <AsyncButton class="toolbar-button" :disabled="saving || preparingPreview" :loading="preparingPreview" @click="openPreview"><Play :size="15" /> {{ t("预览") }}</AsyncButton>
        <AsyncButton class="primary-toolbar-button" :disabled="saving || preparingPreview" :loading="saving && !preparingPreview" @click="saveDesign(true)"><Save :size="15" />{{ t('保存') }}</AsyncButton>
      </div>
    </header>

    <div v-if="saveNotice" class="autosave-notice" :class="{ 'autosave-notice--error': !!autosaveState?.localError || saveState === 'conflict' }" role="status">
      <p>{{ t(saveNotice) }}</p>
      <button v-if="saveState === 'error'" class="toolbar-button" :disabled="saving" @click="saveDesign(false)">{{ t('重试同步') }}</button>
      <AsyncButton v-if="saveState === 'conflict'" class="primary-toolbar-button" :disabled="saving || generating || !autosaveState?.online" :loading="copying" @click="saveConflictCopy">{{ t('另存为云端副本') }}</AsyncButton>
      <button class="toolbar-button" :disabled="copying" @click="downloadDraft()">{{ t('导出本机草稿') }}</button>
    </div>

    <div class="workspace" :inert="copying ? '' : undefined">
      <ComponentLibrary
        :nodes="nodes"
        :selected-ids="selectedIds"
        :generating="generating"
        :build-report="buildReport"
        @add="addNode"
        @select="selectNode"
        @select-layers="selectLayers"
        @reorder="reorder"
        @generate="generate"
        @cancel-generate="cancelGeneration"
        @associate="(id, event, type) => linkPanelFor(id, event, '', type)"
        @associate-existing="(id, event, targetId) => linkPanelFor(id, event, targetId)"
      />

      <section class="canvas-workspace" :aria-label="t('页面画板')" :aria-busy="generating" @click.self="selectNode(null)">
        <div class="horizontal-ruler" aria-hidden="true">
          <span v-for="number in [-200, -100, 0, 100, 200, 300, 400, 500]" :key="number">{{ number }}</span>
        </div>
        <div v-show="!generating" class="canvas-name"><span />{{ fileTitle }}</div>
        <div v-show="!generating" class="canvas-scroll" @click.self="selectNode(null)">
          <PhoneCanvas
            ref="editorCanvas"
            :nodes="nodes"
            :selected-ids="selectedIds"
            :zoom="zoom"
            :editing-panel-id="editingPanel?.id"
            :editing-source-id="associatedEdit?.sourceId"
            @exit-associated-edit="exitAssociatedEdit"
            @select="selectNode"
            @add="addNode"
            @reorder="reorder"
            @patch="patchNode"
            @action="showToast"
          />
        </div>

        <GenerationLoading v-if="generating" @cancel="cancelGeneration" />

        <div v-show="!generating" class="zoom-toolbar">
          <button :title="t('缩小')" @click="setZoom(zoom - 10)"><ZoomOut :size="16" /></button>
          <button class="zoom-value" @click="setZoom(100)">{{ zoom }}%</button>
          <button :title="t('放大')" @click="setZoom(zoom + 10)"><ZoomIn :size="16" /></button>
        </div>
      </section>

      <div class="right-rail">
        <PropertyPanel
          :node="selectedNode"
          :nodes="nodes"
          :selection="selectedNodes"
          :can-group="canGroup"
          :index="selectedIndex"
          :total="selectedLocation?.siblings.length || 0"
          :editing-panel="editingPanel"
          @group="createGroup"
          @ungroup="ungroup"
          @patch="patchSelected"
          @style="selectComponentStyle"
          @extensions="patchExtensions"
          @content="updateContent"
          @duplicate="duplicateSelected"
          @remove="removeSelected"
          @move="moveSelected"
          @error="message => showToast(message, 'error')"
          @preview-panel="selectedNode && editorCanvas?.openPanelPreview(selectedNode.id)"
          @bind-panel="linkPanel"
          @create-panel="(event, type) => linkPanel(event, '', type)"
          @remove-associated="removeAssociated"
          @edit-associated="editAssociatedPanel"
          @exit-associated-edit="exitAssociatedEdit"
        />
        <div class="export-footer">
          <div v-if="exportOpen" class="export-menu">
            <button @click="exportFile('vue')"><Code2 :size="16" /><span><strong>{{ t("Vue 单文件组件") }}</strong><small>{{ t("可直接进入业务工程") }}</small></span></button>
            <button @click="exportFile('json')"><FileJson :size="16" /><span><strong>{{ t("设计 JSON") }}</strong><small>{{ t("继续编辑或接入云端") }}</small></span></button>
            <button @click="exportFile('md')"><FileText :size="16" /><span><strong>{{ t("组件说明文档") }}</strong><small>{{ t("包含复用清单与规范") }}</small></span></button>
          </div>
          <button class="export-button" @click="exportOpen = !exportOpen">
            <Download :size="16" /> {{ t("导出") }} <ChevronDown :size="14" />
          </button>
        </div>
      </div>
    </div>

    <DraftRecoveryDialog v-if="draftsOpen" :drafts="autosaveState?.drafts || []" :cloud-revision="autosaveState?.savedAt || ''" :error="autosaveState?.localError" @keep="keepCurrentDraft" @restore="restoreDraft" @download="downloadDraft" />

    <ConfirmDialog
      v-model:show="clearDialogOpen"
      class="editor-confirm-dialog"
      style="color: var(--text)"
      :title="t('清空画板')"
      :message="t('确认清空画板中的所有组件和容器？清空后可通过撤销恢复。')"
      show-cancel-button
      :confirm-button-text="t('清空画板')"
      :cancel-button-text="t('取消')"
      confirm-button-color="var(--danger)"
      :close-on-click-overlay="false"
      @confirm="clearCanvas"
      @keydown.stop
    />
  </main>
</template>
