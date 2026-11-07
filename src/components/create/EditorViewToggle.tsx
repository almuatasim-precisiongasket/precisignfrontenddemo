export function EditorViewToggle({ value, onChange }: { value: 'editor' | 'preview'; onChange: (value: 'editor' | 'preview') => void }) {
  return <div className="editor-view-toggle no-print" role="group" aria-label="Request view">
    {(['editor', 'preview'] as const).map(view => <button type="button" key={view} aria-pressed={value === view}
      onClick={() => onChange(view)}>{view === 'editor' ? 'Form editor' : 'Live A4 preview'}</button>)}
  </div>;
}
