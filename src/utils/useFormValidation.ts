// Keep native constraints while presenting validation through the shared notice UI.
export function useFormValidation(notify: (message: string, kind: 'error') => unknown) {
  const reported = new WeakSet<HTMLFormElement>();
  function onInvalid(event: Event) {
    event.preventDefault();
    const field = event.target as HTMLInputElement;
    const form = field.form;
    if (!form || reported.has(form)) return;
    // A submit attempt can emit an invalid event for several fields at once.
    reported.add(form);
    queueMicrotask(() => reported.delete(form));
    const label = Array.from(field.labels?.[0]?.childNodes || []).filter(node => node.nodeType === 3).map(node => node.textContent).join('').trim();
    const validity = field.validity;
    const message = validity.valueMissing ? label ? `请填写${label}。` : '请填写此项。'
      : validity.typeMismatch && field.type === 'email' ? '请输入有效的邮箱地址。'
      : validity.rangeUnderflow || validity.rangeOverflow ? `数值需在 ${field.min || '不限'} 至 ${field.max || '不限'} 之间。`
      : validity.badInput || validity.stepMismatch ? '请输入有效的数字。'
      : '请检查输入内容后重试。';
    notify(message, 'error');
    field.focus();
  }
  return { onInvalid };
}
