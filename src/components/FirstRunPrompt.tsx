/**
 * Build Spec §4.1: never guess whether the group bills PFTs globally or
 * professional-component-only — the answer changes which wRVU is credited.
 */
export default function FirstRunPrompt({ onAnswer }: { onAnswer: (model: 'professional' | 'global') => void }) {
  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h2>One-time setup</h2>
        <p>
          For in-office tests (PFTs), does your group bill globally or do you bill the professional component only?
          This changes which wRVU is credited to you.
        </p>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={() => onAnswer('professional')}>
            Professional (26) only
          </button>
          <button className="btn" onClick={() => onAnswer('global')}>
            Global
          </button>
        </div>
      </div>
    </div>
  );
}
