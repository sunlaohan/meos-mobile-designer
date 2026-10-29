<script setup lang="ts">
import { useNotifications } from '../utils/notifications';
import { useI18n, humanize, propertyName } from '../utils/i18n';
const { t, language } = useI18n();
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Check, ChevronDown, Palette, RotateCcw, Ruler, Search, SlidersHorizontal, Type, X } from 'lucide-vue-next';
import { resolveTokenValue, tokenDisplayValue, tokenForValue, tokenGroup, tokenKindLabels, tokenLabel, tokensForProperty } from '../utils/designTokens';
import type { DesignToken, PropertySchema } from '../types';

const props = defineProps<{
  id: string;
  schema: PropertySchema;
  componentType: string;
  modelValue: unknown;
}>();
const emit = defineEmits<{ (event: 'update:modelValue', value: unknown): void }>();

const root = ref<HTMLElement | null>(null);
const popup = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const customTrigger = ref<HTMLButtonElement | null>(null);
const mode = ref<'tokens' | 'custom' | null>(null);
const query = ref('');
const draft = ref('');
const error = ref('');
const { notify } = useNotifications();
function invalid(message: string) { error.value = message; notify(message, 'error'); }
const position = ref({ left: '0px', top: '0px', width: '320px', maxHeight: '440px' });
const placement = ref<'above' | 'below'>('below');
let returnFocus: HTMLElement | null = null;

const kindLabel = computed(() => t(tokenKindLabels[props.schema.tokenKind!]));
const isColor = computed(() => props.schema.tokenKind === 'color');
const isFont = computed(() => ['font-size', 'line-height'].includes(props.schema.tokenKind!));
const isDefault = computed(() => props.modelValue === undefined || props.modelValue === null || props.modelValue === '');
const selectedToken = computed(() => tokenForValue(props.modelValue));
const currentValue = computed(() => isDefault.value ? '' : typeof props.modelValue === 'object' ? JSON.stringify(props.modelValue) : String(props.modelValue));
const allowsZeroSpacing = computed(() => props.schema.tokenKind === 'spacing'
  && (props.schema.min === undefined || props.schema.min <= 0)
  && (props.schema.max === undefined || props.schema.max >= 0));
const isZeroSpacing = computed(() => allowsZeroSpacing.value && /^0(?:px)?$/.test(currentValue.value));
const showZeroSpacing = computed(() => allowsZeroSpacing.value
  && '无间距 零间距 固定值 no spacing zero fixed 0 0px'.includes(query.value.trim().toLowerCase()));
const currentDisplayValue = computed(() => isDefault.value ? t('默认')
  : tokenDisplayValue(selectedToken.value?.value ?? props.modelValue, props.schema.tokenKind!));
const currentDescription = computed(() => selectedToken.value ? `${displayTokenLabel(selectedToken.value)} · ${selectedToken.value.name}`
  : isDefault.value ? t('跟随组件默认样式') : isZeroSpacing.value ? t('无间距 · 固定值') : t('自定义值'));
const tokenGroups = computed(() => {
  const search = query.value.trim().toLowerCase();
  const groups = new Map<string, DesignToken[]>();
  for (const token of tokensForProperty(props.componentType, props.schema)) {
    if (search && !`${token.name} ${tokenLabel(token)} ${displayTokenLabel(token)} ${tokenDisplayValue(token.value, token.kind)}`.toLowerCase().includes(search)) continue;
    const group = tokenGroup(token);
    groups.set(group, [...(groups.get(group) || []), token]);
  }
  const order = ['组件变量', '语义颜色', '基础色板', '渐变颜色'];
  return [...groups].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
});
const colorPickerValue = computed(() => {
  const value = resolveTokenValue(draft.value);
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  if (/^#[\da-f]{3}$/i.test(value)) return `#${[...value.slice(1)].map((part) => part + part).join('')}`;
  return '#246fe5';
});
const placeholder = computed(() => isColor.value
  ? props.schema.allowGradient ? '#246FE5、rgba(...) 或 linear-gradient(...)' : '#246FE5 或 rgba(36, 111, 229, 0.5)'
  : '例如 16、16px、1rem 或 calc(...)');

function displayTokenLabel(token: DesignToken) { return language.value === 'en' ? humanize(token.name) : tokenLabel(token); }

function previewStyle(value: string) {
  return isColor.value && value ? { background: value } : {};
}

function lengthPreview(token: DesignToken) {
  return `${Math.min(18, Math.max(2, parseFloat(resolveTokenValue(token.value)) || 2))}px`;
}

function updatePosition() {
  const anchor = root.value?.getBoundingClientRect();
  if (!anchor || !popup.value) return;
  const gap = 7;
  const availableBelow = window.innerHeight - anchor.bottom - gap - 12;
  const availableAbove = anchor.top - gap - 12;
  const desiredHeight = popup.value.scrollHeight;
  placement.value = availableBelow >= Math.min(desiredHeight, 360) || availableBelow >= availableAbove ? 'below' : 'above';
  const available = placement.value === 'below' ? availableBelow : availableAbove;
  const height = Math.min(desiredHeight, Math.max(120, available), 460);
  const width = Math.min(Math.max(anchor.width, 318), window.innerWidth - 24);
  position.value = {
    left: `${Math.max(12, Math.min(anchor.right - width, window.innerWidth - width - 12))}px`,
    top: `${placement.value === 'below' ? anchor.bottom + gap : Math.max(12, anchor.top - gap - height)}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(120, available)}px`,
  };
}

async function open(next: 'tokens' | 'custom') {
  if (mode.value === next) { close(); return; }
  returnFocus = next === 'tokens' ? trigger.value : customTrigger.value;
  query.value = '';
  error.value = '';
  draft.value = currentValue.value;
  mode.value = next;
  await nextTick();
  updatePosition();
  popup.value?.querySelector<HTMLElement>('input:not([type="color"]), textarea')?.focus();
}

function close(focus = true) {
  mode.value = null;
  if (focus) returnFocus?.focus();
}

function choose(value: unknown) {
  if (value !== props.modelValue) emit('update:modelValue', value);
  close();
}

function applyCustom() {
  const value = draft.value.trim();
  if (!value) { invalid('请输入自定义值，或点击恢复默认。'); return; }
  if (props.schema.control === 'json' && /^[\[{]/.test(value)) {
    try { choose(JSON.parse(value)); }
    catch { invalid('请输入有效的 JSON 数组或对象。'); }
    return;
  }
  const numeric = /^-?(?:\d+\.?\d*|\.\d+)$/.test(value);
  const cssValue = !isColor.value && numeric ? `${value}px` : value;
  const cssProperties: Record<string, string> = { 'font-size': 'font-size', 'line-height': 'line-height', radius: 'border-radius', 'border-width': 'border-width' };
  const cssProperty = isColor.value ? (props.schema.allowGradient ? 'background' : 'color')
    : (cssProperties[props.schema.tokenKind!]
      || (/^(?:margin|padding)/i.test(props.schema.key) ? props.schema.key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
        : /gap|gutter|spacing/i.test(props.schema.key) || props.schema.tokenKind === 'spacing' ? 'gap' : 'width'));
  if (!CSS.supports(cssProperty, cssValue)) {
    invalid(isColor.value ? '请输入有效的颜色值。' : '请输入有效的尺寸，支持 px、rem、em、%、vw、vh。');
    return;
  }
  // Preserve numeric props for bare numbers; CSS expressions and units remain strings.
  if (!isColor.value && /^-?(?:\d+\.?\d*|\.\d+)(?:px)?$/.test(value)) {
    const number = parseFloat(value);
    if ((props.schema.min !== undefined && number < props.schema.min)
      || (props.schema.max !== undefined && number > props.schema.max)) {
      invalid(`数值需在 ${props.schema.min ?? t('不限')} 至 ${props.schema.max ?? t('不限')} 之间。`);
      return;
    }
    choose(numeric ? number : value);
  } else choose(value);
}

function onOutsideClick(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node) && !popup.value?.contains(event.target as Node)) close(false);
}

function onScroll(event: Event) {
  if (popup.value?.contains(event.target as Node)) return;
  updatePosition();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
  } else if (mode.value === 'tokens' && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    if (['Home', 'End'].includes(event.key) && event.target instanceof HTMLInputElement) return;
    event.preventDefault();
    const options = [...(popup.value?.querySelectorAll<HTMLButtonElement>('[role="option"]') || [])];
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
      : event.key === 'ArrowDown' ? (index + 1) % options.length : (index - 1 + options.length) % options.length;
    options[next]?.focus();
  } else if (event.key === 'Tab' && popup.value) {
    const focusable = [...popup.value.querySelectorAll<HTMLElement>('button, input')];
    if (event.shiftKey && document.activeElement === focusable[0]) {
      event.preventDefault(); focusable[focusable.length - 1]?.focus();
    } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
      event.preventDefault(); focusable[0]?.focus();
    }
  }
}

function removeListeners() {
  document.removeEventListener('pointerdown', onOutsideClick, true);
  document.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', updatePosition);
}

watch(mode, (value) => {
  removeListeners();
  if (value) {
    document.addEventListener('pointerdown', onOutsideClick, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', updatePosition);
  }
});
watch([query, error], async () => { if (mode.value) { await nextTick(); updatePosition(); } });
watch(() => props.id, () => close(false));
onBeforeUnmount(removeListeners);
</script>

<template>
  <div class="token-field">
    <div ref="root" class="token-control">
      <button
        :id="id"
        ref="trigger"
        type="button"
        class="token-select"
        :class="{ 'is-open': mode === 'tokens' }"
        :aria-label="t('选择{0}规范变量', [propertyName(schema)])"
        aria-haspopup="dialog"
        :aria-expanded="mode === 'tokens'"
        :aria-controls="mode === 'tokens' ? `${id}-popup` : undefined"
        @click="open('tokens')"
      >
        <span v-if="isColor" class="token-swatch" :class="{ 'is-empty': isDefault }" :style="previewStyle(currentValue)" />
        <Type v-else-if="isFont" :size="15" class="token-kind-icon" />
        <Ruler v-else :size="15" class="token-kind-icon" />
        <span class="token-current-value" :title="currentDisplayValue">{{ currentDisplayValue }}</span>
        <ChevronDown :size="13" class="token-chevron" />
      </button>
      <button
        ref="customTrigger"
        class="token-custom-button"
        :class="{ active: mode === 'custom' || (!isDefault && !selectedToken && !isZeroSpacing) }"
        type="button"
        :title="t('自定义{0}', [kindLabel])"
        :aria-label="t('自定义{0}', [propertyName(schema)])"
        aria-haspopup="dialog"
        :aria-expanded="mode === 'custom'"
        :aria-controls="mode === 'custom' ? `${id}-popup` : undefined"
        @click="open('custom')"
      ><SlidersHorizontal :size="15" /></button>
    </div>
    <span class="token-binding" :title="currentDescription">{{ currentDescription }}</span>

    <Teleport to="body">
      <div
        v-if="mode"
        :id="`${id}-popup`"
        ref="popup"
        class="token-popover"
        :class="[`token-popover--${mode}`, `token-popover--${placement}`]"
        :style="position"
        role="dialog"
        :aria-label="mode === 'tokens' ? t('选择{0}规范变量', [kindLabel]) : t('自定义{0}', [kindLabel])"
        @keydown="onKeydown"
      >
        <template v-if="mode === 'tokens'">
          <div class="token-popover-heading"><span>{{ t('选择{0}变量', [kindLabel]) }}</span><span class="token-source">PERSAGY VANT</span></div>
          <div class="token-search">
            <Search :size="14" />
            <input v-model="query" :aria-label="t('搜索{0}变量', [kindLabel])" :placeholder="t('搜索名称、变量或数值')" />
          </div>
          <div class="token-options" role="listbox" :aria-label="t('可用{0}变量', [kindLabel])">
            <button type="button" class="token-option token-default-option" role="option" :aria-selected="isDefault" @click="choose(undefined)">
              <RotateCcw :size="15" class="token-kind-icon" />
              <span class="token-option-copy"><strong>{{ t("默认") }}</strong><small>{{ t("跟随组件默认样式") }}</small></span>
              <Check v-if="isDefault" :size="14" class="token-check" />
            </button>
            <button v-if="showZeroSpacing" type="button" class="token-option" role="option" :aria-selected="isZeroSpacing" @click="choose(0)">
              <Ruler :size="15" class="token-kind-icon" />
              <span class="token-option-copy"><strong class="token-option-value">0px</strong><small>{{ t("无间距 · 固定值") }}</small></span>
              <Check v-if="isZeroSpacing" :size="14" class="token-check" />
            </button>
            <div v-for="[group, tokens] in tokenGroups" :key="group" role="group" :aria-label="t(group)">
              <div class="token-group-label">{{ t(group) }}</div>
              <button
                v-for="token in tokens"
                :key="token.name"
                type="button"
                class="token-option"
                role="option"
                :aria-selected="selectedToken?.name === token.name"
                :title="`${token.name}: ${token.value}`"
                @click="choose(`var(${token.name})`)"
              >
                <span v-if="isColor" class="token-swatch" :style="previewStyle(`var(${token.name})`)" />
                <Type v-else-if="isFont" :size="15" class="token-kind-icon" />
                <span v-else class="token-length-preview"><i :style="{ width: lengthPreview(token) }" /></span>
                <span class="token-option-copy">
                  <strong class="token-option-value">{{ tokenDisplayValue(token.value, token.kind) }}</strong>
                  <small>{{ displayTokenLabel(token) }} · {{ token.name }}</small>
                </span>
                <Check v-if="selectedToken?.name === token.name" :size="14" class="token-check" />
              </button>
            </div>
            <div v-if="!tokenGroups.length && !showZeroSpacing" class="token-no-results">{{ t("没有匹配的规范变量") }}</div>
          </div>
          <div class="token-popover-note">{{ t("需要其他数值时，可使用旁边的自定义入口。") }}</div>
        </template>

        <form v-else class="token-custom-form" @submit.prevent="applyCustom">
          <header class="token-popover-heading">
            <span><Palette v-if="isColor" :size="15" /><SlidersHorizontal v-else :size="15" />{{ t('自定义{0}', [kindLabel]) }}</span>
            <button type="button" class="token-close" :aria-label="t('关闭自定义设置')" @click="close()"><X :size="15" /></button>
          </header>
          <label :for="`${id}-custom`" class="token-custom-label">{{ propertyName(schema) }}</label>
          <div class="token-custom-input-row">
            <label v-if="isColor" class="token-color-picker" :style="previewStyle(draft)">
              <input type="color" :value="colorPickerValue" :aria-label="t('拾取自定义颜色')" @input="draft = ($event.target as HTMLInputElement).value; error = ''" />
            </label>
            <input
              :id="`${id}-custom`"
              v-model="draft"
              type="text"
              :placeholder="t(placeholder)"
              :aria-label="t('自定义{0}值', [kindLabel])"
              :aria-invalid="Boolean(error)"
              :aria-describedby="`${id}-hint`"
              spellcheck="false"
              autocomplete="off"
              @input="error = ''"
            />
          </div>
          <p :id="`${id}-hint`" class="token-custom-hint">{{ isColor ? (schema.allowGradient ? t('支持 HEX、RGB、RGBA 和渐变色。') : t('支持 HEX、RGB、RGBA 和 CSS 颜色变量。')) : t('支持 px、rem、em、%、vw、vh；纯数字默认使用 px。') }}<template v-if="schema.control === 'json'"> {{ t("也可输入原有 JSON 数组或对象。") }}</template></p>
          <footer class="token-custom-footer">
            <button type="button" class="token-reset" @click="choose(undefined)"><RotateCcw :size="12" />{{ t("恢复默认") }}</button>
            <button type="button" class="token-cancel" @click="close()">{{ t("取消") }}</button>
            <button type="submit" class="token-apply">{{ t("应用") }}</button>
          </footer>
        </form>
      </div>
    </Teleport>
  </div>
</template>
