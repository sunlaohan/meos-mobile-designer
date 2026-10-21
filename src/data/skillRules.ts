import skill from 'persagy-vant/skills/use-persagy-vant/SKILL.md?raw';
import recipes from 'persagy-vant/skills/use-persagy-vant/references/page-recipes.md?raw';
import baseline from 'persagy-vant/skills/use-persagy-vant/references/design-interaction-baseline.md?raw';
import reuse from 'persagy-vant/skills/use-persagy-vant/references/reuse-policy.md?raw';
import variants from 'persagy-vant/skills/use-persagy-vant/references/component-variant-selection.md?raw';
import panels from 'persagy-vant/skills/use-persagy-vant/references/dynamic-panel-policy.md?raw';
import libraryPackage from 'persagy-vant/package.json';
import type { SkillRecipeId } from '../types';

function section(document: string, title: string) {
  return document.split(/^## /m).find((part) => part.startsWith(`${title}\n`))?.slice(title.length).trim() || '';
}

const titles: Record<SkillRecipeId, string> = {
  list: '可筛选的业务列表', detail: '详情与处理页', form: '创建/编辑业务单据',
};

// Local adapters cover a documented subset. Recipe steps and constrained values come
// directly from the installed Skill; unsupported prose changes require adapter review.
export const skillRecipes = Object.entries(titles).map(([id, title]) => ({
  id: id as SkillRecipeId,
  title,
  instructions: section(recipes, title).split('\n').filter((line) => /^\d+[.)]/.test(line)).map((line) => line.replace(/^\d+(?:\.\d+)?[.)]\s*/, '').replaceAll('`', '')),
  source: section(recipes, title),
}));

let fingerprint = 2166136261;
for (const character of [skill, recipes, baseline, reuse, variants, panels].join('\n')) fingerprint = Math.imul(fingerprint ^ character.charCodeAt(0), 16777619);

export const skillRulebook = {
  name: skill.match(/^name:\s*(.+)$/m)?.[1]?.trim() || 'use-persagy-vant',
  version: libraryPackage.version,
  fingerprint: (fingerprint >>> 0).toString(16).padStart(8, '0'),
  sourceFiles: ['SKILL.md', 'references/page-recipes.md', 'references/design-interaction-baseline.md', 'references/reuse-policy.md', 'references/component-variant-selection.md', 'references/dynamic-panel-policy.md'],
  searchVariant: recipes.match(/search variant="([^"]+)"/)?.[1],
  fieldType: baseline.match(/type="(textarea)"/)?.[1],
  fieldLabelPosition: baseline.match(/label-position="([^"]+)"/)?.[1],
  fieldMaxlength: Number(baseline.match(/maxlength="(\d+)"/)?.[1]),
  uploadMaxCount: Number(recipes.match(/max-count="(\d+)"/)?.[1]),
  uploadPreviewSize: Number(baseline.match(/preview-size="(\d+)"/)?.[1]),
  trailingSpace: Number(section(recipes, '卡片页面底部留白').match(/`(\d+)px`/)?.[1]),
  minimumCoverage: Number(reuse.match(/`(\d+)%`/)?.[1]),
  panelTypes: ['content-panel', 'form-panel', 'radio-panel', 'checkbox-panel', 'tree-select-panel', 'action-sheet'].filter((type) => panels.includes(`\`${type}\``)),
};

export function requireSkillRecipe(id: SkillRecipeId) {
  const recipe = skillRecipes.find((item) => item.id === id);
  if (!recipe?.source || !skillRulebook.searchVariant || !skillRulebook.fieldLabelPosition
    || !skillRulebook.fieldType || !skillRulebook.fieldMaxlength || !skillRulebook.trailingSpace
    || !skillRulebook.uploadMaxCount || !skillRulebook.uploadPreviewSize
    || !skillRulebook.minimumCoverage || !skillRulebook.panelTypes.includes('form-panel')) {
    throw new Error('已安装 Skill 的规则不完整或格式发生变化，请先更新离线配方适配器。');
  }
  return recipe;
}
