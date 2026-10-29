<script setup lang="ts">
import AsyncButton from './AsyncButton.vue';
import { useNotifications } from '../utils/notifications';
import { useI18n, componentName } from '../utils/i18n';
const { t, language } = useI18n();
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { BookOpen, ChevronDown, ChevronRight, ExternalLink, FileCode2, ImagePlus, Layers3, Search, Send, Sparkles, X } from 'lucide-vue-next';
import { ImagePreview } from 'persagy-vant';
import AiModelSelector from './AiModelSelector.vue';
import ComponentRenderer from './ComponentRenderer.vue';
import ComponentDragOverlay from './ComponentDragOverlay.vue';
import LayerTree from './LayerTree.vue';
import { componentCatalog, createNode } from '../data/componentCatalog';
import { componentCategories as categories, componentNavigationItems } from '../data/componentNavigation';
import type { BuildAttachment, CanvasNode, ComponentType, PageBuildReport, PageBuildRequest } from '../types';
import { ATTACHMENT_LIMITS, CODE_ACCEPT, IMAGE_ACCEPT, validateAttachments } from '../../shared/attachments.mjs';
import { formatAttachmentSize, readBuildAttachment } from '../utils/buildAttachments';
import { skillRulebook } from '../data/skillRules';
import { getDefinition } from '../data/componentCatalog';
import { getComponentDocsUrl } from '../utils/componentDocs';
import { createCanvasDrag } from '../utils/canvasDrag';

const props = withDefaults(
  defineProps<{
    nodes: CanvasNode[];
    selectedIds?: string[];
    generating?: boolean;
    buildReport?: PageBuildReport;
  }>(),
  { selectedIds: () => [], generating: false },
);

const emit = defineEmits<{
  (event: 'add', type: ComponentType, index?: number, parentId?: string | null): void;
  (event: 'select', id: string, additive?: boolean): void;
  (event: 'select-layers', ids: string[]): void;
  (event: 'reorder', id: string, index: number, parentId?: string | null): void;
  (event: 'generate', request: PageBuildRequest): void;
  (event: 'cancel-generate'): void;
  (event: 'associate', sourceId: string, name: string, type: string): void;
  (event: 'associate-existing', sourceId: string, name: string, targetId: string): void;
}>();

const mode = ref<'components' | 'layers'>('components');
const query = ref('');
const defaultPrompt = '做一个巡检任务列表，包含搜索、任务状态和底部新建入口';
const prompt = ref(t(defaultPrompt));
watch(language, (value, previous) => {
  const previousDefault = previous === 'zh' ? defaultPrompt : 'Create an inspection task list with search, task status, and a bottom action to create a task';
  if (prompt.value === previousDefault) prompt.value = t(defaultPrompt);
});
const selectedModel = ref('');
const modelReady = ref(false);
const supportsImages = ref(false);
const attachments = ref<BuildAttachment[]>([]);
const { notify } = useNotifications();
const readingKind = ref('');
const readingAttachments = ref(false);
const draggingAttachment = ref(false);
const imageInput = ref<HTMLInputElement>();
const codeInput = ref<HTMLInputElement>();
const ImageViewer = ImagePreview.Component;
const previewOpen = ref(false);
const previewImages = ref<string[]>([]);
const previewStart = ref(0);
const imageCompatibilityError = computed(() => attachments.value.some((item) => item.kind === 'image') && modelReady.value && !supportsImages.value ? '当前模型暂未接入图片附件，请选择 Gemini、Qwen、GPT、Claude 或 Kimi，或移除图片。' : '');
watch(imageCompatibilityError, message => { if (message) notify(message, 'error'); });
watch(() => props.buildReport?.warnings, warnings => { for (const message of warnings || []) notify(message, 'warning'); }, { immediate: true });
const canSubmit = computed(() => (prompt.value.trim() || attachments.value.length) && modelReady.value && !props.generating && !readingAttachments.value && !imageCompatibilityError.value);
const openCategories = ref(new Set(categories));
const previewNodes = new Map(componentCatalog.map((item) => [item.type, createNode(item.type)]));

function previewNode(type: ComponentType) {
  return previewNodes.get(type) as CanvasNode;
}

const filtered = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  if (!keyword) return componentNavigationItems;
  return componentNavigationItems.filter((item) =>
    [item.name, componentName(item), item.englishName, item.path, t(item.category), item.category, item.component?.description || '', ...(item.component?.keywords || [])].some((value) => value.toLowerCase().includes(keyword)),
  );
});

function itemsForCategory(category: string) {
  return filtered.value.filter((item) => item.category === category);
}

function toggleCategory(category: string) {
  const next = new Set(openCategories.value);
  next.has(category) ? next.delete(category) : next.add(category);
  openCategories.value = next;
}

const componentPointer = createCanvasDrag({
  nodes: () => props.nodes,
  allowAssociation: true,
  onDrop({ type }, intent) {
    if (intent.kind === 'associate') emit('associate', intent.sourceId, intent.event, type);
    else if (intent.kind === 'canvas') emit('add', type, intent.target.index, intent.target.parentId);
  },
});
onBeforeUnmount(componentPointer.cancel);
function addFromCard(event: MouseEvent, type: string) {
  if (componentPointer.allowsClick(event)) emit('add', type);
}

function submitPrompt() {
  const value = prompt.value.trim();
  if (!canSubmit.value) return;
  emit('generate', { prompt: value, model: selectedModel.value, attachments: attachments.value });
}

async function addAttachments(files: File[]) {
  draggingAttachment.value = false;
  if (!files.length) return;
  if (props.generating || readingAttachments.value) { notify('请等待当前操作完成后再添加附件。', 'warning'); return; }
  readingAttachments.value = true;
  const errors: string[] = [];
  try {
    for (const file of files) {
      readingKind.value = file.type.startsWith('image/') ? 'image' : 'code';
      if (attachments.value.length >= ATTACHMENT_LIMITS.count) { errors.push('最多添加 6 个附件。'); break; }
      try {
        const attachment = await readBuildAttachment(file);
        if (attachments.value.some((item) => item.name === attachment.name && item.content === attachment.content)) { errors.push(`${attachment.name} 已添加。`); continue; }
        attachments.value = validateAttachments([...attachments.value, attachment]);
      } catch (error) { errors.push(error instanceof Error ? error.message : `无法读取 ${file.name}。`); }
    }
  } finally { readingAttachments.value = false; readingKind.value = ''; for (const message of new Set(errors)) notify(message, 'error'); }
}

function chooseFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  void addAttachments(files);
}

function pasteAttachments(event: ClipboardEvent) {
  const clipboard = event.clipboardData;
  if (!clipboard) return;
  const files = Array.from(clipboard.files);
  if (!files.length) for (const item of Array.from(clipboard.items)) {
    if (item.kind === 'file') { const file = item.getAsFile(); if (file) files.push(file); }
  }
  if (files.length) { event.preventDefault(); void addAttachments(files); }
}

function dragAttachments(event: DragEvent) {
  if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); draggingAttachment.value = true; }
}

function leaveAttachments(event: DragEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) draggingAttachment.value = false;
}

function dropAttachments(event: DragEvent) { void addAttachments(Array.from(event.dataTransfer?.files || [])); }

function removeAttachment(id: string) {
  if (props.generating) return;
  attachments.value = attachments.value.filter((item) => item.id !== id);
}

function previewAttachment(attachment: BuildAttachment) {
  const images = attachments.value.filter((item) => item.kind === 'image');
  previewImages.value = images.map((item) => item.content);
  previewStart.value = images.findIndex((item) => item.id === attachment.id);
  previewOpen.value = true;
}

</script>

<template>
  <aside class="library-panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">ASSETS</p>
        <h2>{{ t("资源") }}</h2>
      </div>
      <span class="version">v{{ skillRulebook.version }}</span>
    </div>

    <div class="library-tabs" role="tablist">
      <button :class="{ active: mode === 'components' }" @click="mode = 'components'">
        <Layers3 :size="15" /> {{ t("组件") }}
      </button>
      <button :class="{ active: mode === 'layers' }" @click="mode = 'layers'">
        <span class="layers-icon">≡</span> {{ t("图层") }}
      </button>
    </div>

    <template v-if="mode === 'components'">
      <section class="ai-composer" :class="{ 'ai-composer--dragging': draggingAttachment }" @paste="pasteAttachments" @dragover="dragAttachments" @dragleave="leaveAttachments" @drop.prevent.stop="dropAttachments">
        <div class="ai-title"><Sparkles :size="15" /> {{ t("AI 生成页面") }}<span class="skill-mode-badge">{{ t("模型 + Skill") }}</span></div>
        <AiModelSelector :disabled="generating" @update:model="selectedModel = $event" @update:ready="modelReady = $event" @change="supportsImages = !!$event.supportsImages" />
        <textarea
          v-model="prompt"
          maxlength="4000"
          :disabled="generating"
          :aria-label="t('描述要生成的移动页面')"
          :placeholder="t('描述页面需求，也可以粘贴图片或添加代码附件')"
          @keydown.meta.enter="submitPrompt"
          @keydown.ctrl.enter="submitPrompt"
        />
        <div class="attachment-toolbar">
          <input ref="imageInput" type="file" class="attachment-input" :accept="IMAGE_ACCEPT" multiple :aria-label="t('选择图片附件')" :disabled="generating || readingAttachments" @change="chooseFiles" />
          <input ref="codeInput" type="file" class="attachment-input" :accept="CODE_ACCEPT" multiple :aria-label="t('选择代码附件')" :disabled="generating || readingAttachments" @change="chooseFiles" />
          <AsyncButton :aria-label="t('上传图片')" :title="t('PNG、JPG、WebP；单张不超过 5MB，也可直接粘贴或拖入')" :disabled="generating || readingAttachments" @click="imageInput?.click()" :loading="readingAttachments && readingKind === 'image'"><ImagePlus :size="14" />{{ t("图片") }}</AsyncButton>
          <AsyncButton :aria-label="t('上传代码附件')" :title="t('Vue、JS、TS、CSS、JSON 等 UTF-8 文本；单份不超过 100KB')" :disabled="generating || readingAttachments" @click="codeInput?.click()" :loading="readingAttachments && readingKind === 'code'"><FileCode2 :size="14" />{{ t("代码") }}</AsyncButton>
          <span>{{ readingAttachments ? t('读取中…') : attachments.length ? t('{0}/6 个附件', [attachments.length]) : t('可粘贴或拖入') }}</span>
        </div>
        <div v-if="attachments.length" class="composer-attachments" :aria-label="t('已添加附件')">
          <div v-for="attachment in attachments" :key="attachment.id" class="composer-attachment" :data-attachment-kind="attachment.kind">
            <template v-if="attachment.kind === 'image'">
              <button type="button" class="attachment-image" :aria-label="t('预览图片 {0}', [attachment.name])" @click="previewAttachment(attachment)"><img :src="attachment.content" :alt="attachment.name" /></button>
              <span class="attachment-info"><strong :title="attachment.name">{{ attachment.name }}</strong><small>{{ t("图片 ·") }} {{ formatAttachmentSize(attachment.size) }}</small></span>
            </template>
            <details v-else class="attachment-code">
              <summary :aria-label="t('预览代码 {0}', [attachment.name])"><FileCode2 :size="17" /><span class="attachment-info"><strong :title="attachment.name">{{ attachment.name }}</strong><small>{{ t("代码 ·") }} {{ formatAttachmentSize(attachment.size) }} {{ t("· 点击预览") }}</small></span></summary>
              <pre>{{ attachment.content }}</pre>
            </details>
            <button type="button" class="attachment-remove" :aria-label="t('移除附件 {0}', [attachment.name])" :disabled="generating" @click="removeAttachment(attachment.id)"><X :size="13" /></button>
          </div>
        </div>
        <div class="composer-footer">
          <span :title="`use-persagy-vant ${skillRulebook.version} · ${skillRulebook.fingerprint}`">{{ generating ? t('正在构建页面…') : t('use-persagy-vant · 组件规范') }}</span>
          <button v-if="generating" class="cancel-generation" :title="t('取消生成')" :aria-label="t('取消生成')" @click="emit('cancel-generate')"><X :size="14" /></button>
          <button class="send-button" :disabled="!canSubmit" :title="t('使用所选模型和附件生成页面')" :aria-label="t('生成页面')" @click="submitPrompt">
            <span v-if="generating" class="spinner" />
            <Send v-else :size="14" />
          </button>
        </div>
      </section>
      <ImageViewer v-model:show="previewOpen" :images="previewImages" :start-position="previewStart" closeable @closed="previewImages = []" @keydown.stop />

      <details v-if="buildReport" class="skill-build-report">
        <summary>{{ t("构建说明 ·") }} {{ buildReport.recipeTitle }}</summary>
        <p v-if="buildReport.generation">{{ t("模型：") }}{{ buildReport.generation.actualModel }}<template v-if="buildReport.generation.actualModel !== buildReport.generation.requestedModel">{{ t("（请求") }} {{ buildReport.generation.requestedModel }}）</template></p>
        <ul><li v-for="rule in buildReport.rules" :key="rule">{{ t(rule) }}</li></ul>
        <p>{{ t("组件结构覆盖率") }} {{ buildReport.coverage.percent }}%（{{ buildReport.coverage.covered }}/{{ buildReport.coverage.total }}{{ t("）；不代表业务流程已验收。") }}</p>
        <ul><li v-for="(element, index) in buildReport.elements" :key="index">{{ element.element }} → <a :href="getComponentDocsUrl(getDefinition(element.component).docsPath)" target="_blank" rel="noreferrer">{{ componentName(getDefinition(element.component)) }}</a> · {{ element.variant }}</li></ul>
      </details>

      <div class="search-box">
        <Search :size="15" />
        <input v-model="query" :aria-label="t('搜索组件')" :placeholder="t('搜索组件')" />
        <kbd>⌘ K</kbd>
      </div>

      <div class="component-scroll">
        <section v-for="category in categories" :key="category" v-show="itemsForCategory(category).length" class="category">
          <button class="category-heading" @click="toggleCategory(category)">
            <span>{{ t(category) }}</span>
            <span class="category-count">{{ itemsForCategory(category).length }}</span>
            <ChevronDown v-if="openCategories.has(category)" :size="14" />
            <ChevronRight v-else :size="14" />
          </button>
          <div v-if="openCategories.has(category)" class="component-grid">
            <template v-for="item in itemsForCategory(category)" :key="item.path">
              <button
                v-if="item.component"
                class="component-card"
                :draggable="false"
                :data-component-type="item.path"
                :title="t('拖拽或点击添加 {0}', [componentName(item)])"
                @dragstart.prevent
                @pointerdown="componentPointer.start($event, { type: item.path })"
                @click="addFromCard($event, item.path)"
              >
                <span class="thumbnail">
                  <ComponentRenderer :node="previewNode(item.path)" thumbnail />
                </span>
                <span class="component-meta">
                  <strong>{{ componentName(item) }}</strong>
                  <small>{{ item.englishName }}</small>
                </span>
              </button>
              <a v-else class="component-card component-card--documentation" draggable="false" :href="getComponentDocsUrl(item.path)" target="_blank" rel="noreferrer" :title="t('查看{0}文档（不可拖入画板）', [componentName(item)])">
                <span class="thumbnail"><span class="library-doc-preview"><BookOpen :size="22" /><strong>{{ t("文档入口") }}</strong><small>{{ item.path === 'lazyload' ? t('选中容器，在右侧添加扩展') : item.path === 'bot-mobile' ? t('查看独立组件接入说明') : t('查看配置与使用说明') }}</small></span></span>
                <span class="component-meta"><strong>{{ componentName(item) }}<ExternalLink :size="12" /></strong><small>{{ item.englishName }}</small></span>
              </a>
            </template>
          </div>
        </section>

        <div v-if="!filtered.length" class="no-results">
          <Search :size="22" />
          <p>{{ t('没有找到“{0}”', [query]) }}</p>
          <button @click="query = ''">{{ t("清除搜索") }}</button>
        </div>
      </div>
    </template>

    <div v-else class="layers-panel">
      <div class="layers-list" role="tree" :aria-label="t('页面图层')" aria-multiselectable="true">
      <p class="layers-hint">{{ t("Shift + 单击首尾连续选择；⌘ / Ctrl + 单击逐个加选或取消。拖动图层可调整分组和层级。") }}</p>
      <p v-if="!nodes.length" class="layers-empty">{{ t("画布中还没有组件") }}</p>
      <LayerTree
        :nodes="nodes"
        :selected-ids="selectedIds"
        @selection="emit('select-layers', $event)"
        @reorder="(id, position, parent) => emit('reorder', id, position, parent)"
        @add="(type, position, parent) => emit('add', type, position, parent)"
        @associate="(id, event, targetId) => emit('associate-existing', id, event, targetId)"
      />
      </div>
    </div>
  </aside>
  <ComponentDragOverlay :nodes="nodes" />
</template>
