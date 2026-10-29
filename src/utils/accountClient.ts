import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SavedDesign } from '../types';
import { DesignSaveError } from './designAutosave';
import { designContentKey } from './designDrafts';

let client: SupabaseClient | undefined;
let generationRequestBytes = 18 * 1024 * 1024;
export async function initAccounts() {
  const response = await fetch('/api/account/config');
  if (!response.ok) throw new Error('账号服务连接失败，请刷新重试。');
  const config = await response.json();
  if (!config.configured) throw new Error('账号服务尚未配置，请联系管理员完成 Supabase 配置。');
  generationRequestBytes = Number(config.maxGenerationRequestBytes) || 18 * 1024 * 1024;
  client ||= createClient(config.url, config.anonKey, { auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } });
  return client;
}
export function generationRequestLimit() { return generationRequestBytes; }
export function accounts() {
  if (!client) throw new Error('账号服务尚未就绪。');
  return client;
}
export async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await accounts().auth.getSession();
  if (!session) throw new Error('请先登录账号。');
  return { Authorization: `Bearer ${session.access_token}` };
}
export function accountError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : '操作失败，请稍后重试。';
  if (/Invalid login credentials/i.test(message)) return '邮箱或密码错误，请检查后重试。';
  if (/Email not confirmed/i.test(message)) return '请先点击注册邮件中的链接验证邮箱。';
  if (/Database error saving new user/i.test(message)) return '注册未完成：请检查激活码是否有效、已使用或已删除。';
  if (/already registered/i.test(message)) return '该邮箱已注册，请直接登录或找回密码。';
  if (/rate limit|too many requests|security purposes/i.test(message)) return '操作过于频繁，请稍后再试。';
  if (/email address not authorized|Error sending.*email/i.test(message)) return '邮件暂时无法发送，请联系管理员检查发信服务配置。';
  if (/Password should|weak_password/i.test(message)) return '请使用至少 8 位的密码，包含字母和数字。';
  if (/Failed to fetch|NetworkError/i.test(message)) return '网络连接失败，请检查网络后重试。';
  return message;
}
export interface CloudPage {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  document?: SavedDesign;
}
export async function listPages() {
  const { data, error } = await accounts().from('design_pages').select('id,title,created_at,updated_at').is('deleted_at', null).order('updated_at', { ascending: false });
  if (error) throw error;
  return data as CloudPage[];
}
export async function getPage(id: string, signal?: AbortSignal) {
  const query = accounts().from('design_pages').select('*').eq('id', id).is('deleted_at', null);
  const { data, error } = await (signal ? query.abortSignal(signal) : query).single();
  if (error) throw new Error('页面不存在、已删除或当前账号无权访问。');
  return data as CloudPage;
}
export async function createPage(title = '未命名页面', document?: SavedDesign, signal?: AbortSignal) {
  const query = accounts().from('design_pages').insert({ title, document: document || { version: 1, title, nodes: [], updatedAt: new Date().toISOString() } }).select();
  const { data, error } = await (signal ? query.abortSignal(signal) : query).single();
  if (error) throw error;
  return data as CloudPage;
}
export async function updatePage(page: CloudPage, patch: Record<string, unknown>, signal?: AbortSignal) {
  const query = accounts().from('design_pages').update(patch).eq('id', page.id).eq('updated_at', page.updated_at).is('deleted_at', null).select();
  const { data, error } = await (signal ? query.abortSignal(signal) : query).maybeSingle();
  if (error) throw error;
  if (!data) throw new DesignSaveError('conflict', '页面已在其他窗口更新或被删除。本机草稿已保留，请另存副本，避免覆盖其他版本。');
  return data as CloudPage;
}
export async function savePageDesign(page: CloudPage, document: SavedDesign, signal?: AbortSignal) {
  try { return await updatePage(page, { title: document.title, document }, signal); }
  catch (failure: any) {
    if (signal?.aborted) throw new DesignSaveError('network', '云端保存已中断。');
    if (failure instanceof DesignSaveError && failure.kind === 'conflict') {
      // A previous request may have committed even if its response was lost.
      // A read acknowledges identical content; it never overwrites another edit.
      try {
        const latest = await getPage(page.id, signal);
        if (latest.document && designContentKey({ ...latest.document, title: latest.title }) === designContentKey(document)) return latest;
      } catch { /* Deleted/inaccessible pages still require an explicit copy. */ }
      throw failure;
    }
    const message = String(failure?.message || '云端同步失败，请稍后重试。');
    if (failure?.status === 401 || failure?.status === 403 || /JWT|not authenticated|permission denied|登录已过期/i.test(message)) throw new DesignSaveError('auth', '登录已过期或无编辑权限。本机草稿已保留，请重新登录后同步。');
    if (/fetch|network|timeout|abort/i.test(message)) throw new DesignSaveError('network', '云端连接失败，本机草稿已保留，将自动重试。');
    throw new DesignSaveError('server', accountError(failure));
  }
}
export async function adminApi<T>(route: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/admin/${route}`, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body || {}) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '管理服务请求失败。');
  return data as T;
}
