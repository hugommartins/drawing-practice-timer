import { useCallback } from 'react';
import { api } from './bridge';
import { useStore } from './store';

/** Pick a folder, link it, and tell the user what happened. */
export function useLinkFolder() {
  const { reload, setFlash } = useStore();
  return useCallback(async () => {
    const res = await api().linkFolder();
    if (!res) return null;
    await reload();
    setFlash(
      res.existing
        ? `"${res.collection.name}" is already linked.`
        : `Linked "${res.collection.name}" · ${res.collection.count} image${res.collection.count === 1 ? '' : 's'}. Sessions with it are tracked as "${res.collection.name}".`,
    );
    return res;
  }, [reload, setFlash]);
}
