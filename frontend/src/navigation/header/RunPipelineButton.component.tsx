import type { FC } from 'react';
import type { PipelineStatus } from '../../types';

export interface RunPipelineButtonProps {
  pipelineStatus: PipelineStatus;
  onClick: () => void;
}

export const RunPipelineButton: FC<RunPipelineButtonProps> = ({ pipelineStatus, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pipelineStatus === 'RUNNING'}
      style={{
        backgroundColor: pipelineStatus === 'RUNNING' ? 'var(--accent-bronze)' : '#ff5722',
        color: '#ffffff',
        border: 'none',
        borderRadius: '8px',
        padding: '6px 14px',
        fontSize: '12px',
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        cursor: pipelineStatus === 'RUNNING' ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        boxShadow: '0 2px 8px rgba(255, 87, 34, 0.35)',
        opacity: pipelineStatus === 'RUNNING' ? 0.85 : 1,
      }}
    >
      {pipelineStatus === 'RUNNING' ? (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
          </svg>
          <span>RUNNING...</span>
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>RUN PIPELINE</span>
        </>
      )}
    </button>
  );
};
