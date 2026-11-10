<script setup lang="ts">
import { ref } from 'vue';
import DeliveryDialog from '../../src/components/DeliveryDialog.vue';
import PhoneCanvas from '../../src/components/PhoneCanvas.vue';
import { sourceFromRequest } from '../../src/utils/deliverySource';
import type { CanvasArtboard, DesignSource } from '../../src/types';
const boards = ref<CanvasArtboard[]>([
  { id: 'report', title: '用户报事', nodes: [
    { id: 'nav', type: 'nav-bar', props: { title: '创建报事', leftArrow: true } },
    { id: 'head', type: 'blue-mark-header', props: { title: '报事信息' } },
    { id: 'group', type: 'container-group', props: { fill: '#fff', borderRadius: 12, paddingLeft: 16, paddingRight: 16, marginLeft: 16, marginRight: 16 }, children: [
      { id: 'category', type: 'cell', props: { title: '报事分类', value: '请选择报事分类', isLink: true } },
      { id: 'description', type: 'field', props: { label: '事项描述', placeholder: '请描述现场情况', type: 'textarea', rows: 3, modelValue: '' } },
    ] },
    { id: 'submit', type: 'bottom-action-bar', props: { confirmText: '提交报事', fixed: true } },
  ] },
  { id: 'list', title: '工单列表', nodes: [{ id: 'listnav', type: 'nav-bar', props: { title: '我的工单' } }, { id: 'record', type: 'cell', props: { title: '空调检修', value: '待处理', isLink: true } }] },
]);
boards.value[0].source = sourceFromRequest({ prompt: '美化报事页面，保留原有业务流程。', inputMode: 'image' }, boards.value[0].nodes);
boards.value[0].nodes[2].props.gap = 8;
boards.value[1].source = sourceFromRequest({ prompt: '# 工单列表 PRD\n展示当前用户的工单，支持查看详情和下拉刷新。', inputMode: 'requirements' }, boards.value[1].nodes);
const open = ref(false), active = ref('report');
function source(id: string, value: DesignSource) { boards.value.find(board => board.id === id)!.source = value; }
</script>
<template><main class="harness"><header><div><strong>Compose · 交付开发自测</strong><p>隔离示例，不连接账号或云端设计</p></div><button class="primary-toolbar-button" @click="open = true">交付开发</button></header><section><aside><button v-for="board in boards" :key="board.id" @click="active = board.id">{{ board.title }}</button></aside><PhoneCanvas :key="active" :nodes="boards.find(board => board.id === active)!.nodes" preview /></section><DeliveryDialog v-if="open" title="报事应用" :artboards="boards" :active-id="active" @close="open = false" @source="source" @advanced="open = false" /></main></template>
<style>.harness{height:100%;overflow:auto;background:var(--bg);color:var(--text)}.harness header{display:flex;justify-content:space-between;align-items:center;padding:22px 32px;border-bottom:1px solid var(--line)}.harness header p{margin:8px 0 0;color:var(--text-3);font-size:12px}.harness section{display:flex;justify-content:center;gap:50px;padding:32px}.harness aside{display:flex;flex-direction:column;gap:10px}.harness aside button{padding:12px 24px;background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:7px}</style>
