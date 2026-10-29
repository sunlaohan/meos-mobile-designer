<script setup lang="ts">
import { ref, watch } from 'vue';
import Editor from '../../src/App.vue';
import GlobalNotifications from '../../src/components/GlobalNotifications.vue';
import { DesignSaveError } from '../../src/utils/designAutosave';
import type { SavedDesign } from '../../src/types';
const original: SavedDesign = { version: 1, title: '自动保存验证', updatedAt: '2026-10-28T00:00:00Z', nodes: [
  { id: 'fixture-nav', type: 'nav-bar', props: { title: '自动保存验证', leftArrow: true } },
  { id: 'fixture-cell', type: 'cell', props: { title: '设备名称', value: '冷却塔 CT-01' } },
] };
const mode = ref<'online' | 'offline' | 'conflict'>('online');
const run = new URLSearchParams(location.search).get('run') || 'default';
const fixtureCloudKey = `compose:autosave-fixture-cloud:${run}`;
let stored: SavedDesign = original;
try { stored = JSON.parse(sessionStorage.getItem(fixtureCloudKey) || 'null') || original; } catch { /* Isolated fixture state only. */ }
const cloud = ref<SavedDesign>(JSON.parse(JSON.stringify(stored)));
const opened = ref<SavedDesign>(JSON.parse(JSON.stringify(stored)));
watch(cloud, document => sessionStorage.setItem(fixtureCloudKey, JSON.stringify(document)), { deep: true, flush: 'sync' });
const epoch = ref(0), writes = ref(0), copies = ref(0), revision = ref(0);
const page = ref(`autosave-fixture-page-${run}`);
async function save(document: SavedDesign, signal?: AbortSignal) {
  if (signal?.aborted) throw Error('Aborted');
  if (mode.value === 'offline') throw new DesignSaveError('network', '云端连接失败，本机草稿已保留，将自动重试。');
  if (mode.value === 'conflict') throw new DesignSaveError('conflict', '其他窗口已更新云端，本机草稿已保留。请另存为副本。');
  writes.value++;
  const updatedAt = new Date(Date.parse(original.updatedAt) + ++revision.value * 1000).toISOString();
  cloud.value = { ...JSON.parse(JSON.stringify(document)), updatedAt };
  return updatedAt;
}
async function saveCopy(document: SavedDesign) {
  if (mode.value === 'offline') throw Error('测试服务当前断网');
  copies.value++;
  cloud.value = { ...JSON.parse(JSON.stringify(document)), title: `${document.title}（恢复副本）`, updatedAt: new Date().toISOString() };
  return `autosave-fixture-copy-${copies.value}`;
}
function reopen() { opened.value = JSON.parse(JSON.stringify(cloud.value)); epoch.value++; }
function openCopy(id: string) { page.value = id; reopen(); mode.value = 'online'; }
</script>

<template>
  <div class="autosave-fixture">
    <aside class="fixture-controls">
      <strong>隔离测试：只模拟云端，不会修改真实页面</strong>
      <button @click="mode = 'online'">模拟联网</button><button @click="mode = 'offline'">模拟断网</button><button @click="mode = 'conflict'">模拟云端冲突</button>
      <button @click="reopen">重新打开测试画板</button><button @click="reopen">返回测试页面</button>
      <output aria-label="模拟服务状态" :data-cloud-revision="cloud.updatedAt" :data-writes="writes">{{ mode }} · 写入 {{ writes }} 次 · 副本 {{ copies }} 份 · 云端标题：{{ cloud.title }}</output>
    </aside>
    <div class="fixture-editor"><Editor :key="`${page}:${epoch}`" owner-id="autosave-fixture-owner" :page-id="page" :cloud-design="opened" :save-cloud="save" :save-copy="saveCopy" @back="reopen" @open-copy="openCopy" /></div>
    <GlobalNotifications />
  </div>
</template>

<style scoped>
.autosave-fixture { display: flex; flex-direction: column; height: 100vh; background: var(--bg); color: var(--text); }
.fixture-controls { flex: none; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px; border-bottom: 1px solid var(--line); font-size: 12px; }
.fixture-controls button { padding: 5px 8px; border: 1px solid var(--line); border-radius: 5px; background: var(--panel); color: var(--text); cursor: pointer; }
.fixture-controls output { margin-left: auto; }
.fixture-editor { flex: 1; min-height: 0; }
</style>
