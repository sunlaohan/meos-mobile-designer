import generatedTokens from '../data/generatedDesignTokens.json';
import type { DesignToken, DesignTokenKind, PropertySchema } from '../types';

export const designTokens = generatedTokens as DesignToken[];
const tokenMap = new Map(designTokens.map((token) => [token.name, token]));

export const tokenKindLabels: Record<DesignTokenKind, string> = {
  color: '颜色', 'font-size': '字号', spacing: '间距', radius: '圆角',
  dimension: '尺寸', 'border-width': '边框粗细', 'line-height': '行高',
};

export function propertyTokenKind(component: string, schema: PropertySchema, type: string): DesignTokenKind | undefined {
  if (!['text', 'number', 'json'].includes(schema.control) || !/string/.test(type)) return;
  const key = schema.key;
  if (/color$/i.test(key) || ['background', 'fill'].includes(key)) return 'color';
  if (!/number/.test(type)) return;
  // These APIs perform arithmetic on their values, rather than passing them to CSS.
  if ((component === 'circle' && key === 'strokeWidth')
    || (['row', 'col'].includes(component) && key === 'gutter')
    || (['picker', 'datetime-picker', 'area'].includes(component) && key === 'itemHeight')
    || (['swipe', 'swipe-cell'].includes(component) && /width|height/i.test(key))
    || (component === 'pull-refresh' && key === 'headHeight')) return;
  if (/fontSize$|textSize$|labelSize$/i.test(key)) return 'font-size';
  if (/radius/i.test(key)) return 'radius';
  if (/padding|margin|gap|gutter|spacing/i.test(key) || (component === 'space' && key === 'size')) return 'spacing';
  if (/borderWidth/i.test(key)) return 'border-width';
  if (/lineHeight/i.test(key) && !/底部条|线条/.test(schema.label)) return 'line-height';
  if (/width$|height$|size$/i.test(key) && !/pageSize/i.test(key)) return 'dimension';
}

export function resolveTokenValue(value: string, seen = new Set<string>()): string {
  return value.replace(/var\((--van-[\w-]+)\)/g, (reference, name: string) => {
    const token = tokenMap.get(name);
    if (!token || seen.has(name)) return reference;
    return resolveTokenValue(token.value, new Set([...seen, name]));
  });
}

// Display concrete parameters without changing the stored CSS variable binding.
export function tokenDisplayValue(value: unknown, kind: DesignTokenKind): string {
  const text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
  const resolved = resolveTokenValue(text);
  if (kind !== 'color' && kind !== 'line-height' && /^-?(?:\d+\.?\d*|\.\d+)$/.test(resolved)) return `${resolved}px`;
  return resolved;
}

export function tokenForValue(value: unknown) {
  const name = typeof value === 'string' ? value.trim().match(/^var\((--van-[\w-]+)\)$/)?.[1] : undefined;
  return name ? tokenMap.get(name) : undefined;
}

export function tokensForProperty(component: string, schema: PropertySchema) {
  return designTokens.filter((token) => {
    if (token.scope !== 'public' && token.scope !== component) return false;
    if (schema.tokenKind === 'dimension') {
      if (!['dimension', 'spacing', 'font-size', 'border-width'].includes(token.kind)) return false;
    } else if (token.kind !== schema.tokenKind) return false;
    const resolved = resolveTokenValue(token.value);
    if (!schema.allowGradient && /gradient\(/.test(resolved)) return false;
    if (schema.tokenKind !== 'color' && /^-?[\d.]+(?:px)?$/.test(resolved)) {
      const number = parseFloat(resolved);
      if ((schema.min !== undefined && number < schema.min) || (schema.max !== undefined && number > schema.max)) return false;
    }
    // A scalar prop cannot consume a padding/margin shorthand containing several lengths.
    if (schema.tokenKind !== 'color' && !/padding|margin/i.test(schema.key)
      && /^-?[\d.]+(?:px|rem|em|%)?(?:\s+-?[\d.]+(?:px|rem|em|%)?)+$/.test(resolved)) return false;
    return true;
  }).sort((a, b) => Number(b.scope !== 'public') - Number(a.scope !== 'public'));
}

const publicLabels: Record<string, string> = {
  'primary-color': '品牌主色', 'success-color': '成功色', 'danger-color': '危险色', 'warning-color': '警告色',
  'text-color': '主要文字', 'text-color-2': '次要文字', 'text-color-3': '辅助文字', 'text-link-color': '链接文字',
  'active-color': '激活背景', 'background-color': '页面背景', 'background-color-light': '浅色背景',
  'background-color-black': '深色背景', 'border-color': '边框颜色', black: '黑色', white: '白色',
  blue: '品牌蓝', green: '成功绿', red: '危险红', orange: '警告橙',
  'border-width-base': '基础边框', 'orange-dark': '深橙色', 'orange-light': '浅橙色',
};

const sizes: Record<string, string> = { base: '基础', xs: '超小', sm: '小', md: '标准', lg: '大', xl: '超大', max: '全圆角' };
const colors: Record<string, string> = { blue: '蓝色', green: '绿色', red: '红色', orange: '橙色', gray: '语义灰', grey: '中性灰' };
const componentWords: Record<string, string> = {
  large: '大号', small: '小号', mini: '迷你', default: '默认', primary: '主要',
  pivot: '进度文字', text: '文字', background: '背景', inactive: '未激活', active: '激活',
  color: '颜色', height: '高度', width: '宽度', font: '字体', size: '大小',
  padding: '内边距', margin: '外边距', gap: '间距', border: '边框', radius: '圆角',
  icon: '图标', label: '标签', title: '标题', line: '行', track: '轨道', mark: '竖标',
};

export function tokenLabel(token: DesignToken) {
  const name = token.name.slice('--van-'.length);
  if (publicLabels[name]) return publicLabels[name];
  const scale = name.match(/^(font-size|padding|border-radius|line-height)-(\w+)$/);
  if (scale) return `${sizes[scale[2]] || scale[2]}${tokenKindLabels[token.kind]}`;
  const palette = name.match(/^(blue|green|red|orange|gray|grey)-(\d+)$/);
  if (palette) return `${colors[palette[1]]} ${palette[2]}`;
  if (token.scope !== 'public') {
    return name.slice(token.scope.length + 1).replaceAll('font-size', '字号').replaceAll('line-height', '行高')
      .replaceAll('pivot-text', '进度文字').split('-').map((part) => componentWords[part] || part).join('');
  }
  return name;
}

export function tokenGroup(token: DesignToken) {
  if (token.scope !== 'public') return '组件变量';
  if (token.kind === 'color') {
    if (/gradient/.test(token.name)) return '渐变颜色';
    return /color/.test(token.name) ? '语义颜色' : '基础色板';
  }
  return `${tokenKindLabels[token.kind]}规范`;
}
