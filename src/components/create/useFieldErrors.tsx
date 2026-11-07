import { useId, useState } from 'react';
export function useFieldErrors() {
  const prefix = useId();
  const [errors, setErrors] = useState<Record<string, string>>({});
  function validate(rules: [string, boolean, string][]) {
    const next = Object.fromEntries(rules.filter(([, valid]) => !valid).map(([key, , message]) => [key, message]));
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) requestAnimationFrame(() => document.getElementById(prefix + '-' + first)?.focus());
    return !first;
  }
  const props = (key: string) => ({ id: prefix + '-' + key, 'aria-invalid': !!errors[key], 'aria-describedby': errors[key] ? prefix + '-' + key + '-error' : undefined });
  const message = (key: string) => errors[key] ? <p id={prefix + '-' + key + '-error'} className="mt-1 text-xs text-rose-700">{errors[key]}</p> : null;
  return { validate, props, message };
}
