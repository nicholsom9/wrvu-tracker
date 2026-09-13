import type { CodeRow } from '../types';

/**
 * Build Spec §5 / §8: the abbreviation is the primary identifier everywhere a
 * code appears — the physician does not have CPT numbers memorized. The raw
 * HCPCS number is always present, but secondary/smaller.
 */
export default function CodeLabel({ code, component }: { code: CodeRow; component?: string }) {
  return (
    <span className="code-label">
      <span className="code-abbrev">{code.shortLabel}</span>
      <span className="code-number">
        {code.hcpcs}
        {component ? `-${component}` : ''}
      </span>
    </span>
  );
}
