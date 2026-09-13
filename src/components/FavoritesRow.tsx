import type { CodeRow } from '../types';
import CodeLabel from './CodeLabel';
import type { FavoriteEntry } from '../lib/favorites';

export default function FavoritesRow({
  favorites,
  onTap,
}: {
  favorites: FavoriteEntry[];
  onTap: (code: CodeRow) => void;
}) {
  if (favorites.length === 0) return null;
  return (
    <div className="favorites-row">
      {favorites.map((f) => (
        <button key={`${f.hcpcs}:${f.component}`} className="favorite-chip" onClick={() => onTap(f.code)}>
          <CodeLabel code={f.code} />
        </button>
      ))}
    </div>
  );
}
