import { useStore } from '../store';

export function Flash() {
  const { flash, setFlash } = useStore();
  if (!flash) return null;
  return (
    <div className="flash" role="status" data-testid="flash">
      <span>{flash}</span>
      <button type="button" className="btn ghost" onClick={() => setFlash('')}>Dismiss</button>
    </div>
  );
}
