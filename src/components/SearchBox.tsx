import { Icon } from "./Icon";

export function SearchBox({ value, onChange, placeholder = "Search", id, onSubmit }: { value?: string; onChange?: (v: string) => void; placeholder?: string; id?: string; onSubmit?: () => void }) {
  return <label className="search-box"><Icon name="search" size={18}/><input id={id} value={value} onChange={(e) => onChange?.(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onSubmit?.(); }} placeholder={placeholder}/><kbd>⌘ K</kbd></label>;
}
