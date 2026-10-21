import { createNode, getDefinition, makeId } from '../data/componentCatalog';
import { requireSkillRecipe, skillRulebook } from '../data/skillRules';
import { flattenNodes, isContainer } from './nodeTree';
import type { CanvasNode, GeneratedPage, PageBuildState, PageBuildReport, SkillRecipeId } from '../types';
import fieldReadme from 'persagy-vant/src/field/README.zh-CN.md?raw';

export { skillRecipes, skillRulebook } from '../data/skillRules';

export function inferSkillRecipe(prompt: string): SkillRecipeId {
  const subject = prompt.split(/[,，。；;]|包含|包括|带有|需要有|含有/)[0];
  const classify = (text: string): SkillRecipeId | undefined => {
    if (/列表|清单|任务页|消息中心/.test(text)) return 'list';
    if (/详情|档案|信息页|看板|概览|统计|dashboard/i.test(text)) return 'detail';
    if (/表单|新建|创建|编辑|录入|提交/.test(text)) return 'form';
  };
  const id = classify(subject) || classify(prompt);
  if (!id) throw new Error('当前离线构建支持业务列表、详情与处理页、创建/编辑单据。请明确页面类型，或直接选择配方。');
  return id;
}

function layout(name: string, children: CanvasNode[], props: Record<string, unknown> = {}): CanvasNode {
  return { id: makeId(), type: 'container-group', props: { name, fill: 'transparent', gap: 8, ...props }, children };
}

function withChildren(type: string, props: Record<string, unknown>, children: CanvasNode[]) {
  return { ...createNode(type), props, content: undefined, children };
}

export function generatePageFromPrompt(rawPrompt: string, options: { recipeId?: SkillRecipeId | 'auto'; title?: string; state?: PageBuildState } = {}): GeneratedPage {
  const prompt = rawPrompt.trim();
  if (!prompt) throw new Error('请填写页面需求。');
  const recipeId = options.recipeId && options.recipeId !== 'auto' ? options.recipeId : inferSkillRecipe(prompt);
  const recipe = requireSkillRecipe(recipeId);
  const state = options.state || 'ready';
  if ((state === 'submitting' || state === 'disabled') && recipeId !== 'form') throw new Error('禁用和提交中状态适用于创建/编辑单据配方，请切换页面状态。');
  const domain = prompt.match(/巡检|维修|保养|报修|设备|工单|任务|消息/)?.[0] || '业务';
  const title = options.title?.trim() || `${recipeId === 'form' ? (/编辑/.test(prompt) ? '编辑' : '新建') : ''}${domain}${recipeId === 'list' ? '列表' : recipeId === 'detail' ? (/看板|概览|统计/.test(prompt) ? '看板' : '详情') : '单据'}`;
  const elements: PageBuildReport['elements'] = [];
  const warnings = ['这是使用本地示例数据的页面草稿。业务接口、搜索筛选、分页刷新、上传和提交回调需要后续接入。'];
  const rules = [
    `读取 ${skillRulebook.name} ${skillRulebook.version} 的「${recipe.title}」配方。`,
    '优先复用业务组件，保持组件既有样式，仅增加页面布局与组件间距。',
    `卡片页面末尾保留唯一 ${skillRulebook.trailingSpace}px 留白。`,
    '页面状态可选择正常、首屏加载、空数据或失败；表单另支持禁用、提交中。',
  ];
  function add(type: string, props: Record<string, unknown>, element: string, variant: string): CanvasNode {
    const definition = getDefinition(type);
    if (!definition) throw new Error(`当前组件库没有提供 ${type}，无法构建该配方。`);
    const allowed = new Set(definition.properties.filter((property) => property.target !== 'content').map((property) => property.key));
    if (type === 'field' && /rows="\d+"/.test(fieldReadme)) allowed.add('rows');
    const unknown = Object.keys(props).filter((key) => !allowed.has(key));
    if (unknown.length) throw new Error(`${definition.name} 的属性 ${unknown.join('、')} 不在当前公开 API 中，请更新配方适配器。`);
    elements.push({ element, component: type, variant, props: Object.keys(props) });
    // Catalog defaults include editor demo data; generated pages only use the selected
    // public configuration and let the real component apply its own defaults.
    return { ...createNode(type), props, content: undefined };
  }
  const nav = add('nav-bar', { title, leftArrow: recipeId !== 'list' }, '页面导航', '基础用法 / 返回上级');
  const content: CanvasNode[] = [];
  const panels: CanvasNode[] = [];
  let actionBar: CanvasNode | undefined;

  if (state === 'loading') {
    const loading = add('loading', { type: 'illustration', vertical: true }, '首次进入过渡', '插画加载');
    loading.content = '页面加载中…';
    return finish([nav, loading]);
  }
  if (state === 'empty' || state === 'error') {
    content.push(add('empty', { image: state === 'error' ? 'network' : 'default', description: state === 'error' ? '加载失败，请稍后重试' : '暂无数据' }, '页面结果反馈', '图片类型'));
    if (state === 'error') content.push(add('button', { text: '重新加载', type: 'primary', block: true }, '重新加载入口', '块级元素'));
  } else if (recipeId === 'list') {
    if (!/不(?:要|需要|含|用)搜索|无需搜索/.test(prompt)) content.push(add('search', { variant: skillRulebook.searchVariant, modelValue: '', placeholder: `搜索${domain}名称或编号`, showAction: true }, '顶部搜索', '搜索框样式：pure'));
    else warnings.push('按明确需求省略搜索；与列表配方的默认搜索结构存在差异。');
    if (/筛选/.test(prompt) && !/不要筛选|无需筛选|不需要筛选/.test(prompt)) {
      const filter = add('work-order-filter', { show: false, title: `${domain}筛选` }, '组合筛选面板', '基础用法；内部使用 ActionSheet');
      const trigger = add('cell', { title: '筛选条件', value: '全部', rightIcon: 'arrow', border: false }, '筛选触发入口', '扩展元素：右图标');
      trigger.actions = { click: { type: 'open-panel', targetId: filter.id } };
      content.push(trigger); panels.push(filter);
    }
    content.push(add('blue-mark-header', { title: `${domain}记录` }, '卡片外一级标题', '标题栏'));
    const cards = [1, 2].map((index) => add('work-order-card', {
      title: `${domain}示例任务 ${String(index).padStart(2, '0')}`, expandable: false,
      tags: [{ text: index === 1 ? '未开始' : '进行中', type: index === 1 ? 'danger' : 'primary' }],
      location: `示例位置 · ${index} 层`, primaryInfos: [{ label: '关联对象：', content: `${domain}示例对象 ${index}` }],
    }, '任务条目、状态与位置', '巡检/维修'));
    elements.push({ element: '列表加载与刷新承载', component: 'list', variant: '下拉刷新', props: ['finished', 'finishedText', 'immediateCheck'] });
    elements.push({ element: '下拉刷新', component: 'pull-refresh', variant: '基础用法', props: ['modelValue'] });
    content.push(withChildren('pull-refresh', { modelValue: false }, [withChildren('list', { finished: true, finishedText: '没有更多了', immediateCheck: false }, [layout('列表条目', cards)])]));
    if (/新建|新增|创建|底部|操作栏/.test(prompt) && !/不要底部|无需底部|不要新建|不需要新建/.test(prompt)) actionBar = add('bottom-action-bar', { confirmText: `新建${domain}`, secondaryText: '', fixed: true }, '页面级操作', '基础用法');
    rules.push(`搜索采用 variant="${skillRulebook.searchVariant}"，列表使用 PullRefresh + List，条目复用工单卡片。`);
  } else if (recipeId === 'detail') {
    content.push(add('blue-mark-header', { title: '基础信息' }, '卡片外一级标题', '标题栏'));
    const labels = prompt.match(/字段[：:]\s*([^，。；\n]+)/)?.[1]?.split(/[、,]/).map((label) => label.trim()).filter(Boolean) || ['名称', '编号', '所在位置', '运行状态'];
    content.push(add('info-card', {
      title: `${domain}信息`, fields: labels.map((label, index) => ({ label: `${label}：`, content: `示例${label} ${index + 1}`, visible: true })),
    }, '成组字段回显', '后端字段数据；内部复用字段展示'));
    if (/进度|完成率|看板|概览|统计/.test(prompt)) {
      content.push(add('blue-mark-header', { title: '执行进度' }, '进度模块标题', '标题栏'));
      const card = add('info-card', { showTitle: false, fields: [] }, '进度卡片', '自定义内容');
      card.content = undefined;
      card.children = [add('title-bar', { title: '完成率' }, '卡片内二级标题', '基础用法'), add('progress', { percentage: 72, size: 'large' }, '完成进度', '进度条尺寸')];
      content.push(card);
    }
    if (/处理|维修|操作|底部|编辑|保存/.test(prompt)) actionBar = add('bottom-action-bar', { confirmText: '处理记录', secondaryText: '', fixed: true }, '页面级操作', '基础用法');
    rules.push('一级标题放在卡片外；多字段回显使用信息卡片内部的字段展示组件。');
  } else {
    const labels = prompt.match(/字段[：:]\s*([^，。；\n]+)/)?.[1]?.split(/[、,]/).map((label) => label.trim()).filter(Boolean) || ['单据标题', '问题描述'];
    const fields = labels.map((label, index) => add('field', {
      label, name: `field-${index}`, modelValue: '', placeholder: `请输入${label}`, required: true,
      type: skillRulebook.fieldType, labelPosition: skillRulebook.fieldLabelPosition, inputAlign: 'left',
      maxlength: skillRulebook.fieldMaxlength, showWordLimit: true, rows: index ? 3 : 1, autosize: true,
      disabled: state === 'disabled' || state === 'submitting', border: index < labels.length - 1,
    }, `录入字段：${label}`, '换行文本域 / 显示字数统计'));
    const form = withChildren('form', { disabled: state === 'disabled' || state === 'submitting' }, fields);
    elements.push({ element: '成组输入与校验承载', component: 'form', variant: '基础用法', props: ['disabled'] });
    if (/照片|视频|上传|附件/.test(prompt) && !/不要上传|无需上传|不需要上传/.test(prompt)) {
      form.children!.push(add('uploader', { label: '照片/视频', modelValue: [], accept: 'image/*,video/*', multiple: true, maxCount: skillRulebook.uploadMaxCount, previewSize: skillRulebook.uploadPreviewSize, disabled: state === 'disabled' || state === 'submitting' }, '图片与视频采集', '图片/视频表单'));
      rules.push(`文件上传使用组件表单示例，最多 ${skillRulebook.uploadMaxCount} 个，预览尺寸 ${skillRulebook.uploadPreviewSize}px。`);
    }
    const panel = add('form-panel', { show: false, title, confirmText: '提交' }, '多字段编辑与确认', '基础用法');
    panel.content = undefined; panel.children = [form]; panels.push(panel);
    const trigger = add('cell', { title: '填写单据信息', value: '点击填写', rightIcon: 'arrow', border: false }, '表单面板入口', '扩展元素：右图标');
    if (state === 'ready') trigger.actions = { click: { type: 'open-panel', targetId: panel.id } };
    content.push(add('blue-mark-header', { title: '单据信息' }, '页面一级标题', '标题栏'), trigger);
    if (state === 'disabled' || state === 'submitting') content.push(add('notice-bar', { text: state === 'disabled' ? '当前单据仅可查看，暂不可编辑' : '单据提交中，请勿重复操作', scrollable: false, wrapable: true }, '不可操作原因说明', '多行展示'));
    actionBar = add('bottom-action-bar', { confirmText: state === 'submitting' ? '提交中' : '编辑单据', confirmLoading: state === 'submitting', confirmDisabled: state === 'disabled', secondaryText: '', fixed: true }, '全局编辑入口', '基础用法');
    if (state === 'ready') actionBar.actions = { confirm: { type: 'open-panel', targetId: panel.id } };
    rules.push(`多字段录入由 FormPanel + Form + Field 承载；文本域最大 ${skillRulebook.fieldMaxlength} 字。`);
  }
  const body = layout('页面内容', content, { paddingLeft: 16, paddingRight: 16 });
  const spacer = layout('页面末尾留白', [], { gap: 0, paddingTop: skillRulebook.trailingSpace });
  spacer.layoutRole = 'spacer';
  const background = withChildren('background', { theme: recipeId === 'list' ? 'default' : 'gray' }, [body, spacer]);
  elements.push({ element: '白色卡片页面背景', component: 'background', variant: '切换主题', props: ['theme'] });
  return finish([nav, background, ...(actionBar ? [actionBar] : []), ...panels]);

  function finish(nodes: CanvasNode[]): GeneratedPage {
    const components = flattenNodes(nodes).filter((node) => !isContainer(node));
    for (const node of components) {
      if (!getDefinition(node.type)) throw new Error(`未知组件：${node.type}`);
      if (['popup', 'overlay'].includes(node.type)) throw new Error('业务动态面板必须使用 Skill 指定的专用面板。');
    }
    if (/地图|支付|扫码|NFC|人员选择|物料|楼层选择/i.test(prompt)) warnings.push('需求含当前离线配方尚未适配的能力，请检查组件缺口并补充配置；未用自绘组件替代。');
    const report: PageBuildReport = {
      skill: skillRulebook.name, version: skillRulebook.version, fingerprint: skillRulebook.fingerprint,
      sourceFiles: skillRulebook.sourceFiles, recipeId, recipeTitle: recipe.title, state, prompt, rules, warnings,
      elements, coverage: { covered: components.length, total: components.length, percent: components.length ? 100 : 0 },
    };
    if (report.coverage.percent < skillRulebook.minimumCoverage) throw new Error('当前页面的组件覆盖率未达到 Skill 要求。');
    return { title, summary: `已按 ${recipe.title} 配方构建 · ${components.length} 个组件 · 本地规则`, nodes, report };
  }
}
