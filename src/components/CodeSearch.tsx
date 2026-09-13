import { useMemo, useState } from 'react';
import type { CodeRow } from '../types';
import { searchCodes } from '../lib/search';
import CodeLabel from './CodeLabel';

export default function CodeSearch({ codes, onTap }: { codes: CodeRow[]; onTap: (code: CodeRow) => void }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchCodes(codes, query), [codes, query]);

  return (
    <div className="code-search">
      <input
        type="search"
        inputMode="search"
        placeholder="Search codes: number, abbreviation, or description…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="search-input"
      />
      {query.trim() !== '' && (
        <div className="search-results">
          {results.length === 0 && <div className="search-empty">No matching codes.</div>}
          {results.map((c) => (
            <button
              key={`${c.hcpcs}:${c.modifier}`}
              className="search-result-row"
              onClick={() => {
                onTap(c);
                setQuery('');
              }}
            >
              <CodeLabel code={c} />
              <span className="code-descriptor">{c.longDescriptor}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
