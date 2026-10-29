<script setup lang="ts">
import AsyncButton from './AsyncButton.vue';
import { useAsyncAction } from '../utils/useAsyncAction';
import { useFormValidation } from '../utils/useFormValidation';
import { useNotifications } from '../utils/notifications';
import { useI18n } from '../utils/i18n';
const { t, language } = useI18n();
import LanguageToggle from './LanguageToggle.vue';
import ThemeToggle from './ThemeToggle.vue';
import { computed, ref, onMounted } from 'vue';
import { ArrowLeft, ArrowRight, FileStack, KeyRound, Layers3, Mail, ShieldCheck } from 'lucide-vue-next';
import { accounts, accountError } from '../utils/accountClient';

const props = defineProps<{ recovery?: boolean; initialError?: string }>();
const emit = defineEmits<{ (event: 'recovered'): void }>();
const mode = ref<'login' | 'register' | 'forgot'>(new URLSearchParams(location.search).get('register') === '1' ? 'register' : 'login');
const email = ref(''); const password = ref(''); const repeated = ref(''); const code = ref('');
const { notify } = useNotifications();
const { onInvalid } = useFormValidation(notify);
const { pending, busy, run } = useAsyncAction(failure => notify(accountError(failure), 'error'));
onMounted(() => { if (props.initialError) notify(props.initialError, 'error'); });
const heading = computed(() => props.recovery ? '设置新密码' : ({ login: '欢迎回来', register: '创建你的设计账号', forgot: '找回密码' }[mode.value]));
function switchMode(next: typeof mode.value) { if (busy.value) return; mode.value = next; password.value = ''; repeated.value = ''; }
async function submit() {
  await run('submit', async () => {
    const auth = accounts().auth;
    if (props.recovery || mode.value === 'register') {
      if (password.value.length < 8 || !/[a-z]/i.test(password.value) || !/\d/.test(password.value)) throw new Error('密码至少 8 位，并包含字母和数字。');
      if (password.value !== repeated.value) throw new Error('两次输入的密码不一致。');
    }
    if (props.recovery) {
      const { error: failure } = await auth.updateUser({ password: password.value }); if (failure) throw failure;
      password.value = ''; repeated.value = ''; emit('recovered'); return;
    }
    const address = email.value.trim().toLowerCase();
    if (mode.value === 'login') {
      const { error: failure } = await auth.signInWithPassword({ email: address, password: password.value }); if (failure) throw failure;
    } else if (mode.value === 'register') {
      if (!/^MEOS-[A-F0-9]{8}-[A-F0-9]{8}$/.test(code.value.trim().toUpperCase())) throw new Error('请输入完整的激活码，格式为 MEOS-XXXXXXXX-XXXXXXXX。');
      const { data, error: failure } = await auth.signUp({ email: address, password: password.value, options: { data: { activation_code: code.value.trim().toUpperCase() }, emailRedirectTo: `${location.origin}/?lang=${language.value}` } });
      if (failure) throw failure;
      if (!data.session) { mode.value = 'login'; password.value = ''; repeated.value = ''; notify( '注册申请已提交。请检查邮箱（包括垃圾邮件）并点击验证链接，然后登录。若邮箱已注册，请直接登录或找回密码。'); }
    } else {
      const { error: failure } = await auth.resetPasswordForEmail(address, { redirectTo: `${location.origin}/?recovery=1&lang=${language.value}` }); if (failure) throw failure;
      notify('如果该邮箱已注册，你将收到重设密码邮件。请检查收件箱及垃圾邮件。');
    }
  });
}
async function resend() {
  if (busy.value) return;
  if (!email.value.trim()) { notify('请先填写注册邮箱。', 'error'); return; }
  await run('resend', async () => {
    const { error: failure } = await accounts().auth.resend({ type: 'signup', email: email.value.trim().toLowerCase(), options: { emailRedirectTo: `${location.origin}/?lang=${language.value}` } });
    if (failure) throw failure;
    notify('验证邮件已重新发送，请检查邮箱。');
  });
}
</script>

<template>
  <main class="account-auth">
    <section class="auth-story">
      <div class="auth-story-header"><a class="account-brand" href="/"><span class="brand-mark"><span>C</span></span> Compose</a><div class="surface-controls"><ThemeToggle /><LanguageToggle /></div></div>
      <div class="auth-story-content"><div class="eyebrow">YOUR IDEAS, BEAUTIFULLY BUILT</div><h1>{{ t("从一个想法，") }}<br>{{ t("到每一页精彩。") }}</h1><p>{{ t("为移动业务而生的可视化设计空间。") }}<br>{{ t("让灵感、组件和 AI，在你的画布上相遇。") }}</p><div class="auth-features"><span><Layers3 :size="18" />{{ t("真实组件搭建") }}</span><span><FileStack :size="18" />{{ t("页面云端保存") }}</span><span><ShieldCheck :size="18" />{{ t("独立账号空间") }}</span></div></div>
      <div class="auth-art" aria-hidden="true"><div class="art-card"><div class="art-bar" /><div class="art-heading" /><div class="art-row" /><div class="art-row short" /><div class="art-grid"><i /><i /><i /><i /></div><div class="art-button" /></div><span class="art-note">Made for your next idea.</span></div>
      <small class="auth-footer">{{ t("Compose · 让设计自然发生") }}</small>
    </section>
    <section class="auth-form-side">
      <div class="auth-form-wrap"><div class="auth-icon"><KeyRound v-if="recovery || mode === 'forgot'" :size="24" /><Mail v-else :size="24" /></div><h2>{{ t(heading) }}</h2><p class="muted">{{ recovery ? t('新密码生效后，即可继续访问你的页面。') : mode === 'register' ? t('使用邮箱和一次性激活码，开启你的设计空间。') : mode === 'forgot' ? t('输入注册邮箱，我们会发送重设密码链接。') : t('登录账号，继续你的页面设计。') }}</p>
        <form @invalid.capture.prevent="onInvalid" @submit.prevent="submit">
          <label v-if="!recovery">{{ t("邮箱") }}<input :disabled="busy" v-model="email" type="email" autocomplete="email" placeholder="you@example.com" required maxlength="254" /></label>
          <label v-if="recovery || mode !== 'forgot'">{{ recovery ? t('新密码') : t('密码') }}<input :disabled="busy" v-model="password" type="password" :autocomplete="recovery || mode === 'register' ? 'new-password' : 'current-password'" :placeholder="mode === 'register' || recovery ? t('至少 8 位，包含字母和数字') : t('输入你的密码')" required maxlength="128" /></label>
          <label v-if="recovery || mode === 'register'">{{ t("确认密码") }}<input :disabled="busy" v-model="repeated" type="password" autocomplete="new-password" :placeholder="t('再次输入密码')" required maxlength="128" /></label>
          <label v-if="mode === 'register' && !recovery">{{ t("激活码") }}<input :disabled="busy" v-model="code" class="code-input" placeholder="MEOS-XXXXXXXX-XXXXXXXX" autocomplete="off" required maxlength="22" /><small>{{ t("向管理员获取，每个激活码仅可注册一个账号。") }}</small></label>

          <AsyncButton type="submit" class="account-primary" :disabled="busy" :loading="pending === 'submit'">{{ recovery ? t('保存新密码') : mode === 'register' ? t('创建账号') : mode === 'forgot' ? t('发送重设链接') : t('登录') }}<ArrowRight :size="17" /></AsyncButton>
        </form>
        <template v-if="!recovery"><div v-if="mode === 'login'" class="auth-links"><button :disabled="busy" @click="switchMode('forgot')">{{ t("忘记密码？") }}</button><AsyncButton :disabled="busy" @click="resend" :loading="pending === 'resend'">{{ t("重发验证邮件") }}</AsyncButton></div><p class="auth-switch" v-if="mode === 'login'">{{ t("还没有账号？") }}<button :disabled="busy" @click="switchMode('register')">{{ t("使用激活码注册") }}</button></p><button v-else class="text-button back-login" :disabled="busy" @click="switchMode('login')"><ArrowLeft :size="14" />{{ t("返回登录") }}</button><div class="auth-help">{{ t("邮箱就是你的登录账号。忘记邮箱时，可提供激活码或领取备注，联系管理员核对。") }}</div><a class="admin-entry" href="/?admin=1">{{ t("激活码管理") }}</a></template>
      </div>
    </section>
  </main>
</template>
