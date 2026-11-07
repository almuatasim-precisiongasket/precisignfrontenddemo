import type { ComponentProps } from 'react';

// Local shadcn/ui-style primitives. Native controls retain their form and keyboard behavior.
export function EditorInput(props: ComponentProps<'input'>) {
  return <input {...props} data-slot="input" />;
}

export function EditorTextarea(props: ComponentProps<'textarea'>) {
  return <textarea {...props} data-slot="textarea" />;
}

export function EditorSelect(props: ComponentProps<'select'>) {
  return <select {...props} data-slot="native-select" />;
}
