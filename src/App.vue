<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Code2,
  Download,
  FileJson,
  FileText,
  MonitorSmartphone,
  Play,
  Redo2,
  Save,
  Sparkles as SparklesIcon,
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
import { createNode, getDefinition, makeId } from './data/componentCatalog';
import type { CanvasNode, ComponentType, ContainerExtensions, PageBuildReport, PageBuildRequest, SavedDesign } from './types';
import { extensionTreeError, updateContainerExtensions } from './utils/containerExtensions';
import { downloadText, toJson, toMarkdown, toVueSfc } from './utils/exportDesign';
import { generatePageFromPrompt } from './utils/pageGenerator';
import { generatePageWithAi } from './utils/aiClient';
import { bindPanel, removeAssociatedPanel } from './utils/panelInteractions';
import { isCanvasPanel } from './utils/canvasPresentation';
import { associatedPanelEdit, selectionInPanelEdit, validPanelEdit, type AssociatedPanelEdit } from './utils/associatedPanelEditing';
import {
  canGroupNodes, canHaveChildren, cloneNodes, containsNode, duplicateNodes, findNode, flattenNodes,
  groupNodes, isContainer, moveNode, removeNodes, selectionRoots, ungroupNode,
} from './utils/nodeTree';

const STORAGE_KEY = 'meri-mobile-designer:document';
const urlParams = new URLSearchParams(location.search);
const previewPayload = urlParams.get('data');
const zoom = ref(100);
const editorCanvas = ref<InstanceType<typeof PhoneCanvas>>();
const selectedIds = ref<string[]>([]);
const associatedEdits = ref<AssociatedPanelEdit[]>([]);
const associatedEdit = computed(() => associatedEdits.value[associatedEdits.value.length - 1]);
const fileTitle = ref('移动端巡检页面');
const nodes = ref<CanvasNode[]>([]);
const saveState = ref<'saved' | 'dirty' | 'saving'>('saved');
const savedAt = ref('');
const generating = ref(false);
const generationError = ref('');
let generationController: AbortController | undefined;
const exportOpen = ref(false);
const clearDialogOpen = ref(false);
const ConfirmDialog = Dialog.Component;
const toast = ref('');
const toastKind = ref<'success' | 'error'>('success');
const generationSummary = ref('');
const buildReport = ref<PageBuildReport | undefined>();
const isPreview = ref(urlParams.get('preview') === '1' || location.hash === '#preview');
let toastTimer: number | undefined;

function loadDesign(): SavedDesign | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedDesign) : null;
  } catch {
    return null;
  }
}

const saved = loadDesign();
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
  savedAt.value = saved.updatedAt;
} else {
  const initial = generatePageFromPrompt('巡检任务列表');
  fileTitle.value = initial.title;
  nodes.value = initial.nodes;
  buildReport.value = initial.report;
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

function showToast(message: string, kind: 'success' | 'error' = 'success') {
  toast.value = message;
  toastKind.value = kind;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = ''), 2400);
}

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
  generationSummary.value = '';
  selectedIds.value = selectionRoots(nodes.value, nextSelection).map((node) => node.id);
  if (historyIndex.value < history.value.length - 1) history.value.splice(historyIndex.value + 1);
  history.value.push({ title, nodes: cloneNodes(next), selectedIds: [...selectedIds.value], report });
  if (history.value.length > 60) history.value.shift();
  historyIndex.value = history.value.length - 1;
  saveState.value = 'dirty';
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
  // Fixed navigation should reserve its original space unless explicitly overridden.
  if (node.type === 'nav-bar' && patch.fixed === true) node.props.placeholder = true;
  Object.assign(node.props, patch);
  commit(next, [id]);
}

function patchSelected(patch: Record<string, unknown>) {
  if (selectedNode.value) patchNode(selectedNode.value.id, patch);
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
  if (type && !isCanvasPanel({ type } as CanvasNode)) { showToast(`「${getDefinition(type).name}」不支持关联，请点击虚线框选择支持的控件`, 'error'); return; }
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
  saveState.value = 'dirty';
}

function redo() {
  if (!canRedo.value) return;
  history.value[historyIndex.value].title = fileTitle.value;
  historyIndex.value += 1;
  fileTitle.value = history.value[historyIndex.value].title;
  nodes.value = cloneNodes(history.value[historyIndex.value].nodes);
  buildReport.value = history.value[historyIndex.value].report;
  selectedIds.value = [...history.value[historyIndex.value].selectedIds];
  saveState.value = 'dirty';
}

function saveDesign(notify = true) {
  saveState.value = 'saving';
  const document: SavedDesign = {
    version: 1,
    title: fileTitle.value,
    updatedAt: new Date().toISOString(),
    nodes: cloneNodes(nodes.value),
    report: buildReport.value,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
  savedAt.value = document.updatedAt;
  window.setTimeout(() => {
    saveState.value = 'saved';
    if (notify) showToast('已保存到本机，云端保存接口可在后续接入');
  }, 260);
}

function openPreview() {
  saveDesign(false);
  window.open(`${location.origin}${location.pathname}#preview`, '_blank', 'noopener,noreferrer');
}

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
    generationSummary.value = generated.summary;
    showToast(`已生成「${generated.title}」`);
  } catch (error) {
    if (controller.signal.aborted) showToast('已取消生成');
    else generationError.value = error instanceof Error ? error.message : '页面构建失败，请检查需求与配方。';
  } finally { generating.value = false; generationController = undefined; }
}

function setZoom(next: number) {
  zoom.value = Math.max(50, Math.min(150, next));
}

function exportFile(kind: 'vue' | 'json' | 'md') {
  const safeName = fileTitle.value.replace(/[\\/:*?"<>|]/g, '-') || 'mobile-page';
  if (kind === 'vue') downloadText(`${safeName}.vue`, toVueSfc(fileTitle.value, nodes.value), 'text/plain;charset=utf-8');
  if (kind === 'json') downloadText(`${safeName}.json`, toJson(fileTitle.value, nodes.value, buildReport.value), 'application/json;charset=utf-8');
  if (kind === 'md') downloadText(`${safeName}-组件说明.md`, toMarkdown(fileTitle.value, nodes.value, buildReport.value), 'text/markdown;charset=utf-8');
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
  location.href = `${location.origin}${location.pathname}`;
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('hashchange', onHashChange);
});

onBeforeUnmount(() => {
  generationController?.abort();
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('hashchange', onHashChange);
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <main v-if="isPreview" class="preview-page">
    <div class="preview-chrome">
      <div class="brand-mark small"><span>M</span></div>
      <div><strong>{{ fileTitle }}</strong><span>交互预览 · {{ componentCount }} 个组件</span></div>
      <button @click="exitPreview">返回编辑器</button>
    </div>
    <div class="preview-canvas">
      <PhoneCanvas :nodes="nodes" preview :zoom="100" @patch="patchNode" @action="showToast" />
    </div>
    <Transition name="toast"><div v-if="toast" class="app-toast preview-toast" :class="{ 'app-toast--error': toastKind === 'error' }" :role="toastKind === 'error' ? 'alert' : 'status'"><AlertCircle v-if="toastKind === 'error'" :size="15" /><Check v-else :size="15" />{{ toast }}</div></Transition>
  </main>

  <main v-else class="designer-shell">
    <header class="topbar">
      <div class="topbar-left">
        <div class="brand-mark"><span>M</span></div>
        <div class="document-title">
          <input v-model="fileTitle" aria-label="文件名称" @input="saveState = 'dirty'" />
          <span>
            <i :class="saveState" />
            {{ saveState === 'saved' ? '本地已保存' : saveState === 'saving' ? '正在保存' : '未保存更改' }}
          </span>
        </div>
      </div>

      <div class="topbar-center">
        <button :disabled="!canUndo" title="撤销 ⌘Z" @click="undo"><Undo2 :size="16" /></button>
        <button :disabled="!canRedo" title="重做 ⇧⌘Z" @click="redo"><Redo2 :size="16" /></button>
        <span class="toolbar-divider" />
        <span class="device-label"><MonitorSmartphone :size="15" /> iPhone 14 · 390 × 844</span>
      </div>

      <div class="topbar-right">
        <button class="toolbar-button clear-canvas-button" :disabled="!nodes.length" aria-label="清空画板" title="清空画板" @click="clearDialogOpen = true"><Trash2 :size="15" /> 清空画板</button>
        <button class="toolbar-button" @click="openPreview"><Play :size="15" /> 预览</button>
        <button class="primary-toolbar-button" @click="saveDesign(true)"><Save :size="15" /> 保存</button>
      </div>
    </header>

    <div class="workspace">
      <ComponentLibrary
        :nodes="nodes"
        :selected-ids="selectedIds"
        :generating="generating"
        :generation-error="generationError"
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

      <section class="canvas-workspace" aria-label="页面画板" :aria-busy="generating" @click.self="selectNode(null)">
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

        <div v-if="generationSummary && !generating" class="generation-note">
          <SparklesIcon />
          <span>{{ generationSummary }}</span>
          <button @click="generationSummary = ''">×</button>
        </div>

        <div v-show="!generating" class="zoom-toolbar">
          <button title="缩小" @click="setZoom(zoom - 10)"><ZoomOut :size="16" /></button>
          <button class="zoom-value" @click="setZoom(100)">{{ zoom }}%</button>
          <button title="放大" @click="setZoom(zoom + 10)"><ZoomIn :size="16" /></button>
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
            <button @click="exportFile('vue')"><Code2 :size="16" /><span><strong>Vue 单文件组件</strong><small>可直接进入业务工程</small></span></button>
            <button @click="exportFile('json')"><FileJson :size="16" /><span><strong>设计 JSON</strong><small>继续编辑或接入云端</small></span></button>
            <button @click="exportFile('md')"><FileText :size="16" /><span><strong>组件说明文档</strong><small>包含复用清单与规范</small></span></button>
          </div>
          <button class="export-button" @click="exportOpen = !exportOpen">
            <Download :size="16" /> 导出 <ChevronDown :size="14" />
          </button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-model:show="clearDialogOpen"
      style="color: var(--van-text-color)"
      title="清空画板"
      message="确认清空画板中的所有组件和容器？清空后可通过撤销恢复。"
      show-cancel-button
      confirm-button-text="清空画板"
      cancel-button-text="取消"
      confirm-button-color="var(--van-danger-color)"
      :close-on-click-overlay="false"
      @confirm="clearCanvas"
      @keydown.stop
    />
    <Transition name="toast"><div v-if="toast" class="app-toast" :class="{ 'app-toast--error': toastKind === 'error' }" :role="toastKind === 'error' ? 'alert' : 'status'"><AlertCircle v-if="toastKind === 'error'" :size="15" /><Check v-else :size="15" />{{ toast }}</div></Transition>
  </main>
</template>
