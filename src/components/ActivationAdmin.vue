<script setup lang="ts">
import AsyncButton from './AsyncButton.vue';
import { useAsyncAction } from '../utils/useAsyncAction';
import { useFormValidation } from '../utils/useFormValidation';
import { useNotifications } from '../utils/notifications';
import { useI18n, formatDate } from '../utils/i18n';
const { t } = useI18n();
import LanguageToggle from './LanguageToggle.vue';
import ThemeToggle from './ThemeToggle.vue';
import { computed, onMounted, ref } from 'vue';
import { ArrowLeft, CheckCheck, Copy, KeyRound, LogOut, Plus, RefreshCw, Search, ShieldCheck, Ticket, Trash2 } from 'lucide-vue-next';
import { accountError, adminApi } from '../utils/accountClient';

interface Code { id: string; code: string; note: string; created_at: string; used_at: string | null; used_email: string | null }
const authenticated = ref(false); const loading = ref(true);
const { notify } = useNotifications();
const { onInvalid } = useFormValidation(notify);
const { pending, busy, run } = useAsyncAction(failure => notify(accountError(failure), 'error'), () => loading.value);
const username = ref('admin'); const password = ref('');
const codes = ref<Code[]>([]); const search = ref(''); const status = ref('all'); const count = ref(1); const note = ref(''); const deleting = ref<Code | null>(null);
const visible = computed(() => codes.value.filter(code => (status.value === 'all' || Boolean(code.used_at) === (status.value === 'used')) && `${code.code} ${code.note} ${code.used_email || ''}`.toLowerCase().includes(search.value.toLowerCase())));
const used = computed(() => codes.value.filter(code => code.used_at).length);
const time = (value: string | null) => value ? formatDate(value, { hour12: false }) : '—';
async function refresh() { codes.value = await adminApi<Code[]>('codes'); }
function login() { void run('login', async () => { await adminApi('login', 'POST', { username: username.value, password: password.value }); password.value = ''; authenticated.value = true; await refresh(); }); }
function create() { void run('create', async () => { await adminApi('codes', 'POST', { count: count.value, note: note.value }); await refresh(); note.value = ''; notify(`已创建 ${count.value} 个激活码，可复制后下发。`); }); }
function remove() { const target = deleting.value; if (!target) return; void run('delete', async () => { await adminApi(`codes/${target.id}`, 'DELETE'); deleting.value = null; await refresh(); notify('激活码已删除，已注册账号不受影响。'); }); }
function logout() { void run('logout', async () => { await adminApi('logout', 'POST'); authenticated.value = false; codes.value = []; }); }
async function copy(value: string) {
  await run(`copy:${value}`, async () => {
    try { await navigator.clipboard.writeText(value); }
    catch { throw new Error('复制失败，请选中激活码手动复制。'); }
    notify('激活码已复制。');
  });
}
onMounted(async () => {
  try { authenticated.value = (await adminApi<{ authenticated: boolean }>('session')).authenticated; if (authenticated.value) await refresh(); }
  catch (failure) { notify(accountError(failure), 'error'); } finally { loading.value = false; }
});
</script>

<template>
  <main v-if="!authenticated" class="admin-login account-surface"><div class="admin-login-header"><a href="/" class="text-button"><ArrowLeft :size="16" />{{ t("返回设计平台") }}</a><div class="surface-controls"><ThemeToggle /><LanguageToggle /></div></div><form @invalid.capture.prevent="onInvalid" class="admin-login-card" @submit.prevent="login"><div class="auth-icon"><ShieldCheck :size="25" /></div><div class="eyebrow">COMPOSE ADMIN</div><h1>{{ t("激活码管理") }}</h1><p class="muted">{{ t("登录管理员账号，管理设计平台的访问资格。") }}</p><label>{{ t("管理员账号") }}<input :disabled="busy" v-model="username" autocomplete="username" required /></label><label>{{ t("密码") }}<input :disabled="busy" v-model="password" type="password" autocomplete="current-password" required maxlength="256" /></label><AsyncButton type="submit" class="account-primary" :disabled="busy" :loading="pending === 'login'">{{ t('登录管理后台') }}</AsyncButton></form></main>
  <main v-else class="account-surface admin-page"><header class="account-header"><a href="/" class="account-brand"><span class="brand-mark"><span>C</span></span>Compose <span class="header-tag">{{ t("管理后台") }}</span></a><div><div class="surface-controls"><ThemeToggle /><LanguageToggle /></div><span class="muted">admin</span><AsyncButton class="text-button" :disabled="busy" @click="logout" :loading="pending === 'logout'"><LogOut :size="16" />{{ t("退出登录") }}</AsyncButton></div></header><div class="account-main"><div class="dashboard-heading"><div><div class="eyebrow">ACCESS MANAGEMENT</div><h1>{{ t("激活码管理") }}</h1><p class="muted">{{ t("创建、下发并追踪每一次激活。每个激活码仅可使用一次。") }}</p></div><a href="/" class="account-secondary"><ArrowLeft :size="16" />{{ t("设计平台") }}</a></div>
    <div class="admin-stats"><div><Ticket :size="21" /><span>{{ t("激活码总数") }}<strong>{{ codes.length }}</strong></span></div><div><KeyRound :size="21" /><span>{{ t("待使用") }}<strong>{{ codes.length - used }}</strong></span></div><div><CheckCheck :size="21" /><span>{{ t("已使用") }}<strong>{{ used }}</strong></span></div></div>
    <form @invalid.capture.prevent="onInvalid" class="code-create" @submit.prevent="create"><div><h2>{{ t("创建激活码") }}</h2><p class="muted">{{ t("备注可记录领取人或发放用途，便于后续找回账号。") }}</p></div><label>{{ t("数量") }}<input :disabled="busy" v-model.number="count" type="number" min="1" max="100" required /></label><label class="code-note">{{ t("领取备注") }}<input :disabled="busy" v-model="note" :placeholder="t('如：产品部 · 张三')" maxlength="200" /></label><AsyncButton type="submit" class="account-primary" :disabled="busy" :loading="pending === 'create'"><Plus :size="17" />{{ t("生成激活码") }}</AsyncButton></form>

    <div class="list-controls"><div class="account-search"><Search :size="17" /><input :disabled="busy" v-model="search" :aria-label="t('搜索激活码')" :placeholder="t('搜索激活码、备注或注册邮箱')" /></div><select v-model="status" :aria-label="t('使用状态')"><option value="all">{{ t("全部状态") }}</option><option value="unused">{{ t("待使用") }}</option><option value="used">{{ t("已使用") }}</option></select><AsyncButton class="account-secondary" :disabled="busy" @click="run('refresh', refresh)" :loading="pending === 'refresh'"><RefreshCw :size="15" />{{ t("刷新") }}</AsyncButton></div>
    <div class="code-table-wrap"><table class="code-table"><thead><tr><th>{{ t("激活码") }}</th><th>{{ t("领取备注") }}</th><th>{{ t("状态") }}</th><th>{{ t("注册邮箱") }}</th><th>{{ t("创建时间 / 使用时间") }}</th><th>{{ t("操作") }}</th></tr></thead><tbody><tr v-for="code in visible" :key="code.id"><td class="code-cell">{{ code.code }}<AsyncButton :aria-label="t('复制 {0}', [code.code])" class="icon-button" :disabled="busy" @click="copy(code.code)" :loading="pending === `copy:${code.code}`"><Copy :size="14" /></AsyncButton></td><td>{{ code.note || '—' }}</td><td><span class="status-pill" :class="code.used_at ? 'used' : 'unused'">{{ code.used_at ? t('已使用') : t('待使用') }}</span></td><td>{{ code.used_email || '—' }}</td><td class="date-cell">{{ time(code.created_at) }}<small>{{ time(code.used_at) }}</small></td><td><button class="icon-button danger" :disabled="busy" :aria-label="t('删除 {0}', [code.code])" @click="deleting = code"><Trash2 :size="16" /></button></td></tr><tr v-if="!visible.length"><td colspan="6" class="empty-table">{{ codes.length ? t('没有符合条件的激活码') : t('暂无激活码，在上方创建你的第一批激活码。') }}</td></tr></tbody></table></div><p v-if="codes.length >= 1000" class="muted">{{ t("当前展示最近 1000 条记录。") }}</p>
  </div><div v-if="deleting" class="account-modal-backdrop" @click.self="!busy && (deleting = null)"><section class="account-modal" role="dialog" aria-modal="true" aria-labelledby="delete-code-title"><h2 id="delete-code-title">{{ t("删除激活码？") }}</h2><p>{{ deleting.used_at ? t('该激活码已使用，删除后将从列表隐藏。对应账号和页面继续保留。') : t('该激活码将立即失效，无法再用于注册。') }}</p><code>{{ deleting.code }}</code><div class="modal-actions"><button class="account-secondary" :disabled="busy" @click="deleting = null">{{ t("取消") }}</button><AsyncButton class="account-danger" :disabled="busy" @click="remove" :loading="pending === 'delete'">{{ t("确认删除") }}</AsyncButton></div></section></div></main>
</template>
