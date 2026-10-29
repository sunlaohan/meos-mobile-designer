<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Check, ChevronDown, ExternalLink } from 'lucide-vue-next';
import ComponentRenderer from './ComponentRenderer.vue';
import { componentStylePreview, selectedComponentStyle, stylesFor } from '../utils/componentStyles';
import { getDefinition } from '../data/componentCatalog';
import { getComponentDocsUrl } from '../utils/componentDocs';
import { useI18n } from '../utils/i18n';
import type { CanvasNode } from '../types';
import PanelSearch from './PanelSearch.vue';
import SearchHighlight from './SearchHighlight.vue';
import { filterComponentStyles } from '../utils/panelSearch';

const props = defineProps<{ node: CanvasNode }>();
const emit = defineEmits<{ (event: 'select', id: string): void }>();
const { t } = useI18n();
const expanded = ref(false);
const query = ref('');
const searching = computed(() => !!query.value.trim());
const styles = computed(() => stylesFor(props.node.type));
const matches = computed(() => filterComponentStyles(styles.value, query.value));
const selected = computed(() => selectedComponentStyle(props.node));
const displayed = computed(() => (searching.value ? matches.value : expanded.value ? styles.value : styles.value.filter((item, index) => index < 6 || item.id === selected.value)).map((style) => ({ ...style, node: componentStylePreview(props.node.type, style) })));
function styleName(name: string) { const match = name.match(/^(.*) (\d+)$/); return match ? `${t(match[1])} ${match[2]}` : t(name); }
watch(() => props.node.id, () => { expanded.value = false; query.value = ''; });
function select(id: string) {
  emit('select', id);
}
</script>

<template>
  <section v-if="styles.length" class="property-group component-style-picker" :aria-label="t('组件样式')">
    <div class="component-style-heading"><h3>{{ t('组件样式') }}</h3><a :href="getComponentDocsUrl(getDefinition(node.type).docsPath)" target="_blank" rel="noreferrer">{{ t('查看示例') }}<ExternalLink :size="11" /></a></div>
    <PanelSearch v-model="query" label="搜索组件样式" placeholder="搜索样式名称或英文属性" />
    <p v-if="searching" class="panel-search-feedback" role="status">{{ matches.length ? t('找到 {0} 个样式', [matches.length]) : t('未找到匹配的样式') }}</p>
    <div class="component-style-grid">
      <button v-for="style in displayed" :key="style.id" type="button" class="component-style-option" :class="{ active: selected === style.id }" :aria-pressed="selected === style.id" :aria-label="t('切换样式：{0}', [styleName(style.name)])" :data-style-id="style.id" @click="select(style.id)">
        <span class="component-style-thumbnail" aria-hidden="true" inert><ComponentRenderer :node="style.node" thumbnail style-preview /></span>
        <span class="component-style-caption"><SearchHighlight :text="styleName(style.name)" :query="query" /><Check v-if="selected === style.id" :size="12" /></span>
      </button>
    </div>
    <button v-if="!searching && styles.length > 6" class="component-style-expand" type="button" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? t('收起样式') : t('全部样式（{0}）', [styles.length]) }}<ChevronDown :size="13" :class="{ expanded }" /></button>
    <p class="component-style-help">{{ t('切换会同步调整样式相关属性，可撤销。') }}</p>
  </section>
</template>
