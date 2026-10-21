import generatedNames from '../data/generatedIconNames.json';
import type { PropertySchema } from '../types';

const common = ['arrow', 'arrow-left', 'arrow-up', 'arrow-down', 'search', 'plus', 'cross', 'success', 'edit', 'delete-o', 'setting-o', 'more-o', 'filter-o', 'scan', 'location-o', 'calendar-o', 'apps-o'];
const names = new Set(generatedNames);
export const iconNames: string[] = [...common.filter((name) => names.has(name)), ...generatedNames.filter((name) => !common.includes(name))];
const words: Record<string, string> = {
  arrow: '箭头 方向', left: '左 返回', right: '右 前进', up: '上 收起', down: '下 展开',
  search: '搜索 查找', plus: '添加 新增 加号', add: '添加 新增', cross: '关闭 叉号', close: '关闭',
  success: '成功 完成 确认 对勾', passed: '通过 确认 对勾', fail: '失败 错误', warning: '警告 提醒', warn: '警告',
  info: '信息 提示', question: '问题 帮助', attention: '注意 提醒', edit: '编辑 修改', word: '文字 文档',
  delete: '删除 垃圾桶', setting: '设置 齿轮', more: '更多', filter: '筛选 过滤', scan: '扫码 扫描',
  location: '位置 定位 地点', locate: '定位', map: '地图', calendar: '日历 日期', date: '日期', time: '时间',
  clock: '时钟 时间', alarm: '闹钟 提醒', apps: '应用 宫格', app: '应用', home: '首页 主页',
  user: '用户 人员', friends: '好友 人员', manager: '管理 人员', phone: '电话 手机', iphone: '手机',
  chat: '聊天 消息 对话', comment: '评论 消息', service: '客服 服务', message: '消息', massage: '消息',
  photo: '图片 照片', image: '图片', video: '视频', play: '播放', pause: '暂停', stop: '停止',
  upload: '上传', download: '下载', copy: '复制', share: '分享', link: '链接', eye: '查看 眼睛',
  visible: '可见 显示', lock: '锁定', unlock: '解锁', star: '星标 收藏', like: '喜欢 点赞',
  heart: '爱心 喜欢', bell: '铃铛 通知', orders: '订单 工单', order: '订单 工单', todo: '待办 任务',
  list: '列表 清单', file: '文件', folder: '文件夹', print: '打印', cart: '购物车', shop: '商店',
  gift: '礼物', flag: '旗帜 标记', bar: '条形', chart: '图表', trend: '趋势', loading: '加载',
  building: '建筑 楼宇', equipment: '设备', device: '设备', wrench: '扳手 维修', fire: '火 消防',
  mic: '麦克风 语音', volume: '音量 声音', keyboard: '键盘', code: '代码', wifi: '网络',
  signal: '信号', tower: '塔', nfc: '近场 通讯', router: '路由器', package: '包裹 物料',
  certificate: '证书', connect: '连接', exchange: '交换 切换', layers: '图层', o: '线框',
};

export function iconKeywords(name: string) {
  return `${name} ${name.split(/[-_]/).map((word) => words[word] || '').join(' ')}`;
}

export function searchIcons(query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return iconNames.filter((name) => terms.every((term) => iconKeywords(name).toLowerCase().includes(term)));
}

export function isIconProperty(component: string, schema: PropertySchema) {
  return schema.control === 'text' && ((component === 'icon' && schema.key === 'name') || schema.key === 'icon' || /Icon$/.test(schema.key));
}

export function isBuiltinIcon(value: unknown): value is string {
  return typeof value === 'string' && names.has(value);
}

export function isImageIcon(value: unknown): value is string {
  return typeof value === 'string' && (/^(?:https?:\/\/|\/|\.\.?\/|data:image\/(?:png|jpe?g|gif|webp|svg\+xml);)/i.test(value));
}

export function validCustomIcon(value: string) {
  if (!value || /[<>\s]/.test(value)) return false;
  return /^[a-z\d][\w-]*$/i.test(value) || isImageIcon(value);
}
