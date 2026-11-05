import { useEffect, useState } from 'react';
import type { CollectionInfo } from '../../shared/types';
import { go } from '../appctx';
import { useLinkFolder } from '../actions';
import { api, bridge, imagePath } from '../bridge';
import { ConfirmDialog, PromptDialog } from '../components/Confirm';
import { Flash } from '../components/Flash';
import { IconFolder } from '../components/icons';
import { useStore } from '../store';

function Previews({ c }: { c: CollectionInfo }) {
  const [imgs, setImgs] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    if (!c.reachable || c.count === 0) {
      setImgs([]);
      return;
    }
    void api()
      .collectionImages(c.id)
      .then((list) => live && setImgs(list.slice(0, 8)));
    return () => {
      live = false;
    };
  }, [c.id, c.count, c.reachable]);
  if (imgs.length === 0) return null;
  return (
    <div className="tiles" data-testid="previews">
      {imgs.map((rel) => (
        <img key={rel} className="tile" loading="lazy" decoding="async" alt="" src={bridge().fileUrl(imagePath(c.path, rel))} />
      ))}
    </div>
  );
}

export function Library() {
  const { collections, reload, patchSettings, settings, setFlash } = useStore();
  const link = useLinkFolder();
  const [renaming, setRenaming] = useState<CollectionInfo | null>(null);
  const [removing, setRemoving] = useState<CollectionInfo | null>(null);

  async function rescan(c: CollectionInfo) {
    const res = await api().rescanCollection(c.id);
    await reload();
    if (res) setFlash(`Rescanned "${res.name}": ${res.count} image${res.count === 1 ? '' : 's'}.`);
  }
  async function relink(c: CollectionInfo) {
    const res = await api().relinkCollection(c.id);
    if (!res) return;
    await reload();
    setFlash(`"${res.name}" now points to the new folder (${res.count} images).`);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Library</h1>
          <p className="muted">Each linked folder is a drawing type. Images stay where they are; Plchldr only reads them.</p>
        </div>
        <div className="chip-row">
          <button type="button" className="btn primary" data-testid="library-link" onClick={() => void link()}>
            Link a folder
          </button>
        </div>
      </div>

      <Flash />

      {collections.length === 0 ? (
        <section className="card empty" data-testid="empty-library">
          <div className="art"><IconFolder size={44} plus /></div>
          <h2>No folders linked yet</h2>
          <p className="muted">Link a folder and it shows up here with a preview. You can link as many as you like.</p>
          <button type="button" className="btn primary big" data-testid="link-folder-cta" onClick={() => void link()}>
            Link a folder
          </button>
          <div className="tips">
            <div><strong>Name folders by type</strong><p className="muted small">"Hands", "Portraits", "Gesture". The name is how practice is grouped.</p></div>
            <div><strong>Subfolders are included</strong><p className="muted small">Everything inside is picked up. Hidden files are skipped.</p></div>
            <div><strong>Files stay put</strong><p className="muted small">Nothing is copied or uploaded.</p></div>
          </div>
        </section>
      ) : (
        <div className="col-list">
          {collections.map((c) => (
            <section key={c.id} className="card col-card" data-testid="collection" data-name={c.name} aria-label={c.name}>
              <div className="col-top">
                <div style={{ minWidth: 0 }}>
                  <h2 data-testid="collection-name">{c.name}</h2>
                  <div className="col-path">{c.path}</div>
                  <div className="muted small" data-testid="collection-status" style={{ marginTop: 4 }}>
                    {c.reachable ? `${c.count} image${c.count === 1 ? '' : 's'}` : 'Folder not found. Is the drive connected?'}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn primary"
                  data-testid="practice-collection"
                  disabled={!c.reachable || c.count === 0}
                  onClick={() => {
                    void patchSettings({ setup: { ...settings.setup, collectionId: c.id } });
                    go('practice');
                  }}
                >
                  Practice this
                </button>
              </div>
              <Previews c={c} />
              <div className="col-actions">
                <button type="button" className="btn" data-testid="collection-rename" onClick={() => setRenaming(c)}>Rename</button>
                <button type="button" className="btn" data-testid="collection-relink" onClick={() => void relink(c)}>Change folder</button>
                <button type="button" className="btn" data-testid="collection-rescan" onClick={() => void rescan(c)}>Rescan</button>
                <button type="button" className="btn danger" data-testid="collection-remove" onClick={() => setRemoving(c)}>Remove</button>
              </div>
            </section>
          ))}
        </div>
      )}

      {renaming && (
        <PromptDialog
          open
          key={renaming.id}
          title="Rename folder"
          description="New sessions are tracked under this name. Past sessions keep the old one."
          initial={renaming.name}
          confirmLabel="Rename"
          onClose={() => setRenaming(null)}
          onSubmit={(name) => {
            void api()
              .renameCollection(renaming.id, name)
              .then(() => reload());
            setRenaming(null);
          }}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        title={`Remove "${removing?.name ?? ''}"?`}
        description="The folder and its images on disk are not touched. Past sessions stay in your history."
        confirmLabel="Remove"
        danger
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          void api()
            .removeCollection(removing.id)
            .then(() => reload());
          setRemoving(null);
        }}
      />
    </>
  );
}
