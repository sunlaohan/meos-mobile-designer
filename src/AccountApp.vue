<script setup lang="ts">
import AsyncButton from './components/AsyncButton.vue';
import GlobalNotifications from './components/GlobalNotifications.vue';
import DesignSkeleton from './components/DesignSkeleton.vue';
import PageGridSkeleton from './components/PageGridSkeleton.vue';
import { designLoadingVariant } from './utils/designLoading';
import { useAsyncAction } from './utils/useAsyncAction';
import { useFormValidation } from './utils/useFormValidation';
import { useNotifications } from './utils/notifications';
import { useI18n, formatDate } from './utils/i18n';
const { t, language } = useI18n();
import LanguageToggle from './components/LanguageToggle.vue';
import ThemeToggle from './components/ThemeToggle.vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Session, Subscription } from '@supabase/supabase-js';
import { ArrowRight, Cloud, FilePlus2, FileText, FolderOpen, KeyRound, LogOut, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Trash2, Upload, X } from 'lucide-vue-next';
import Editor from './App.vue';
import AuthScreen from './components/AuthScreen.vue';
import ActivationAdmin from './components/ActivationAdmin.vue';
import { accounts, accountError, createPage, getPage, initAccounts, listPages, updatePage, savePageDesign, type CloudPage } from './utils/accountClient';
import type { SavedDesign } from './types';
import { workspaceUrl } from './utils/siteRouting';

const isAdmin = new URLSearchParams(location.search).get('admin') === '1';
const callbackFailed = new URLSearchParams(location.hash.slice(1)).has('error_description') || new URLSearchParams(location.search).has('error_description');
const callbackMessage = callbackFailed ? '邮件链接已失效或已使用，请重新发送验证邮件或申请重设密码。' : '';
const session = ref<Session | null>(null); const ready = ref(false); const initError = ref('');
const loadingUser = ref(false);
const { notify } = useNotifications();
const { onInvalid } = useFormValidation(notify);
const { pending, busy, run } = useAsyncAction(failure => notify(accountError(failure), 'error'), () => loadingUser.value);
const recovery = ref(!callbackFailed && (new URLSearchParams(location.search).get('recovery') === '1' || new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery'));
const pages = ref<CloudPage[]>([]); const active = ref<CloudPage | null>(null); const search = ref(''); const menu = ref<string | null>(null); const renaming = ref<CloudPage | null>(null); const title = ref(''); const deleting = ref<CloudPage | null>(null);
const visible = computed(() => pages.value.filter(page => page.title.toLowerCase().includes(search.value.toLowerCase())));
const loadingVariant = computed(() => pending.value.startsWith('open:') ? 'editor' : designLoadingVariant(new URL(location.href)));
const time = (value: string) => formatDate(value, { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
let subscription: Subscription | undefined;
let generation = 0;
async function refresh() { const current = session.value?.user.id; const data = await listPages(); if (current === session.value?.user.id) pages.value = data; }
async function loadUser(userSession: Session | null) {
  const turn = ++generation;
  session.value = userSession; active.value = null; pages.value = []; loadingUser.value = false;
  if (!userSession || recovery.value) return;
  loadingUser.value = true;
  try {
    const { data: profile, error: profileError } = await accounts().from('profiles').select('id').eq('id', userSession.user.id).single();
    if (profileError || !profile) throw new Error('此账号未完成激活，请联系管理员。');
    const data = await listPages(); if (turn !== generation) return;
    pages.value = data;
    const pageId = new URLSearchParams(location.search).get('page');
    if (pageId) { const page = await getPage(pageId); if (turn === generation) active.value = page; }
  } catch (failure) { if (turn === generation) notify(accountError(failure), 'error'); }
  finally { if (turn === generation) loadingUser.value = false; }
}
async function boot() {
  initError.value = ''; ready.value = false;
  try {
    const client = await initAccounts();
    subscription?.unsubscribe();
    subscription = client.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') recovery.value = true;
      if (event === 'SIGNED_OUT') void loadUser(null);
      else if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && newSession?.user.id !== session.value?.user.id)) {
        // Avoid awaiting other Auth calls within the SDK's auth-state lock.
        window.setTimeout(() => { void loadUser(newSession); }, 0);
      } else if (event === 'TOKEN_REFRESHED') session.value = newSession;
    }).data.subscription;
    const { data, error: failure } = await client.auth.getSession(); if (failure) throw failure;
    await loadUser(data.session);
    if (callbackFailed) { notify(callbackMessage, 'error'); history.replaceState(null, '', '/login'); }
  } catch (failure) { initError.value = accountError(failure); notify(initError.value, 'error'); }
  finally { ready.value = true; }
}
function open(page: CloudPage) { void run(`open:${page.id}`, async () => { const data = await getPage(page.id); active.value = data; history.replaceState(null, '', workspaceUrl(page.id)); }); }
function newPage() { void run('create', async () => { const page = await createPage(t('未命名页面')); pages.value.unshift(page); active.value = page; history.replaceState(null, '', workspaceUrl(page.id)); }); }
async function save(document: SavedDesign, signal?: AbortSignal) {
  const page = active.value; const owner = session.value?.user.id;
  if (!page || !owner) throw new Error('登录已过期，请重新登录后保存。');
  const saved = await savePageDesign(page, document, signal);
  if (signal?.aborted) throw new Error('云端保存已中断。');
  if (owner !== session.value?.user.id || active.value?.id !== page.id) throw new Error('账号或页面已切换，请重新打开页面。');
  active.value = saved;
  const index = pages.value.findIndex(item => item.id === saved.id); if (index >= 0) pages.value[index] = saved;
  return saved.updated_at;
}
async function saveCopy(document: SavedDesign) {
  const owner = session.value?.user.id;
  if (!owner) throw new Error('登录已过期，请重新登录后另存副本。');
  const suffix = `（${t('恢复副本')}）`;
  const title = `${(document.title.trim() || t('未命名页面')).slice(0, 100 - suffix.length)}${suffix}`;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  let page: CloudPage;
  try { page = await createPage(title, { ...document, title }, controller.signal); }
  finally { window.clearTimeout(timeout); }
  if (owner !== session.value?.user.id) throw new Error('账号已切换，副本保存在原账号中。');
  pages.value.unshift(page);
  return page.id;
}
function openCreatedPage(id: string) {
  const page = pages.value.find(item => item.id === id);
  if (page?.document) { active.value = page; history.replaceState(null, '', workspaceUrl(id)); }
}
function back() { active.value = null; history.replaceState(null, '', workspaceUrl()); void run('refresh', refresh); }
function startRename(page: CloudPage) { renaming.value = page; title.value = page.title; menu.value = null; }
function rename() { void run('rename', async () => { if (!renaming.value) return; const name = title.value.trim(); if (!name || name.length > 100) throw new Error('页面名称需为 1–100 个字符。'); await updatePage(renaming.value, { title: name }); renaming.value = null; await refresh(); notify('页面名称已更新。'); }); }
function remove() { void run('delete', async () => { if (!deleting.value) return; await updatePage(deleting.value, { deleted_at: new Date().toISOString() }); deleting.value = null; await refresh(); notify('页面已删除。'); }); }
function logout() { void run('logout', async () => { const { error: failure } = await accounts().auth.signOut(); if (failure) throw failure; history.replaceState(null, '', '/login'); }); }
function requestReset() { void run('reset', async () => { const { error: failure } = await accounts().auth.resetPasswordForEmail(session.value!.user.email!, { redirectTo: `${location.origin}/?recovery=1&lang=${language.value}` }); if (failure) throw failure; notify('重设密码邮件已发送，请检查邮箱。'); }); }
function recovered() { recovery.value = false; history.replaceState(null, '', workspaceUrl()); void run('recovery', async () => { await loadUser(session.value); notify('密码已更新。'); }); }
function importLegacy() { void run('import', async () => { const raw = localStorage.getItem('meri-mobile-designer:document'); if (!raw) throw new Error('本机没有旧版设计文档。'); let doc: SavedDesign; try { doc = JSON.parse(raw); } catch { throw new Error('本机旧文档格式有误。'); } if (doc.version !== 1 || !Array.isArray(doc.nodes)) throw new Error('本机旧文档格式有误。'); const page = await createPage((doc.title || t('导入的页面')).slice(0, 100), doc); pages.value.unshift(page); notify('本机旧文档已导入当前账号。'); }); }
onMounted(() => { if (!isAdmin) void boot(); });
onBeforeUnmount(() => subscription?.unsubscribe());
</script>

<template>
  <GlobalNotifications />
  <ActivationAdmin v-if="isAdmin" />
  <Transition v-else name="account-view" mode="out-in">
  <main v-if="initError" class="account-loading"><div class="surface-controls"><ThemeToggle /><LanguageToggle /></div><div class="brand-mark"><span>C</span></div><h2>{{ t('账号服务暂不可用') }}</h2><button class="account-primary" @click="boot">{{ t("重新连接") }}</button><a href="/?admin=1" class="text-button">{{ t("激活码管理") }}</a></main>
  <DesignSkeleton v-else-if="!ready || loadingUser || pending.startsWith('open:')" :variant="loadingVariant" />
  <div v-else-if="!session || recovery" class="account-view"><AuthScreen :recovery="Boolean(session && recovery)" @recovered="recovered" /></div>
  <div v-else-if="active?.document" :key="`${session.user.id}:${active.id}`" class="account-view"><Editor :owner-id="session.user.id" :cloud-design="{ ...active.document, title: active.title, updatedAt: active.updated_at }" :save-cloud="save" :save-copy="saveCopy" :page-id="active.id" @back="back" @open-copy="openCreatedPage" /></div>
  <main v-else class="account-surface dashboard" @click="menu = null">
    <header class="account-header"><a class="account-brand" href="/"><span class="brand-mark"><span>C</span></span>Compose</a><div><div class="surface-controls"><ThemeToggle /><LanguageToggle /></div><span class="user-email" :title="session.user.email">{{ session.user.email }}</span><AsyncButton class="text-button" :disabled="busy" @click="requestReset" :loading="pending === 'reset'"><KeyRound :size="15" />{{ t("重设密码") }}</AsyncButton><AsyncButton class="text-button" :disabled="busy" @click="logout" :loading="pending === 'logout'"><LogOut :size="16" />{{ t("退出") }}</AsyncButton></div></header>
    <div class="account-main"><div class="dashboard-heading"><div><div class="eyebrow">YOUR DESIGN WORKSPACE</div><h1>{{ t("我的页面") }}<span>{{ pages.length }}</span></h1><p class="muted">{{ t("让每一个想法，都有自己的画布。") }}</p></div><AsyncButton class="account-primary" :disabled="busy" @click="newPage" :loading="pending === 'create'"><Plus :size="18" />{{ t("新建页面") }}</AsyncButton></div>
      <div class="workspace-banner"><div class="workspace-banner-icon"><Cloud :size="23" /></div><div><strong>{{ t("你的设计，随时继续。") }}</strong><p>{{ t("页面保存至当前账号的云端空间，登录后即可继续编辑。") }}</p></div><span><span class="online-dot" />{{ t("云端工作空间") }}</span></div>
      <div class="list-controls"><div class="account-search"><Search :size="17" /><input v-model="search" :aria-label="t('搜索页面')" :placeholder="t('搜索页面名称…')" /></div><AsyncButton class="text-button" :disabled="busy" @click="importLegacy" :loading="pending === 'import'"><Upload :size="15" />{{ t("导入本机旧文档") }}</AsyncButton><AsyncButton class="account-secondary" :disabled="busy" @click="run('refresh', refresh)" :loading="pending === 'refresh'"><RefreshCw :size="15" />{{ t("刷新") }}</AsyncButton></div>

      <PageGridSkeleton v-if="pending === 'refresh' && !pages.length" />
      <div v-else-if="!visible.length" class="dashboard-empty"><FolderOpen :size="42" /><h2>{{ search ? t('没有找到相关页面') : t('从你的第一张画布开始') }}</h2><p class="muted">{{ search ? t('试试其他页面名称。') : t('自由拖拽组件，或让 AI 帮你完成页面雏形。') }}</p><AsyncButton v-if="!search" class="account-primary" :disabled="busy" @click="newPage" :loading="pending === 'create'"><Plus :size="17" />{{ t("新建页面") }}</AsyncButton></div>
      <div v-else class="page-grid"><article v-for="page in visible" :key="page.id" class="page-card"><button class="page-card-preview" :aria-busy="pending === `open:${page.id}`" :aria-label="t('打开 {0}', [page.title])" :disabled="busy" @click="open(page)"><div class="mini-page"><div class="mini-page-header" /><div class="mini-page-title" /><div class="mini-page-blocks"><i /><i /></div><div class="mini-page-row" /><div class="mini-page-row" /><div class="mini-page-row" /></div><span class="page-open"><span v-if="pending === `open:${page.id}`" class="inline-action-spinner" aria-hidden="true" />{{ t("打开设计") }}<ArrowRight :size="15" /></span></button><div class="page-card-meta"><div><AsyncButton class="page-title-button" :disabled="busy" @click="open(page)" :loading="pending === `open:${page.id}`">{{ page.title }}</AsyncButton><small>{{ t("更新于") }} {{ time(page.updated_at) }}</small></div><div class="page-card-menu"><button class="icon-button" :aria-label="t('{0} 的更多操作', [page.title])" @click.stop="menu = menu === page.id ? null : page.id"><MoreHorizontal :size="19" /></button><div v-if="menu === page.id" class="page-menu"><button :disabled="busy" @click="startRename(page)"><Pencil :size="14" />{{ t("重命名") }}</button><button class="danger" :disabled="busy" @click="deleting = page"><Trash2 :size="14" />{{ t("删除页面") }}</button></div></div></div></article><AsyncButton class="page-new-card" :disabled="busy" @click="newPage" :loading="pending === 'create'"><FilePlus2 :size="28" />{{ t("新建页面") }}</AsyncButton></div>
      <div class="dashboard-footnote"><FileText :size="14" />{{ t("页面自动保存至云端；离线修改保存在本机，联网后继续同步。") }}</div>
    </div>
    <div v-if="renaming || deleting" class="account-modal-backdrop" @click.self="!busy && (renaming = null, deleting = null)"><form @invalid.capture.prevent="onInvalid" class="account-modal" role="dialog" aria-modal="true" aria-labelledby="page-modal-title" @submit.prevent="renaming ? rename() : remove()"><button class="modal-close icon-button" type="button" :disabled="busy" :aria-label="t('关闭')" @click="renaming = null; deleting = null"><X :size="18" /></button><h2 id="page-modal-title">{{ renaming ? t('重命名页面') : t('删除页面？') }}</h2><label v-if="renaming">{{ t("页面名称") }}<input v-model="title" :disabled="busy" required maxlength="100" autofocus /></label><p v-else>{{ t('“{0}”将从你的页面列表移除。', [deleting?.title]) }}</p><div class="modal-actions"><button class="account-secondary" type="button" :disabled="busy" @click="renaming = null; deleting = null">{{ t("取消") }}</button><AsyncButton type="submit" :class="renaming ? 'account-primary' : 'account-danger'" :disabled="busy" :loading="pending === 'rename' || pending === 'delete'">{{ renaming ? t('保存名称') : t('删除页面') }}</AsyncButton></div></form></div>
  </main>
  </Transition>
</template>
