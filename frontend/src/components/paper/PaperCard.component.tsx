import type { FC } from 'react';
import { useTranslation } from '../../hooks';

export interface PaperCardProps {
  paperId: string;
  title: string;
  authors: string;
  category: string;
  publishedDate: string;
  mathCount: number;
  wordCount: number;
  onClick?: (paperId: string) => void;
}

export const PaperCard: FC<PaperCardProps> = ({
  paperId,
  title,
  authors,
  category,
  publishedDate,
  mathCount,
  wordCount,
  onClick,
}) => {
  const { language } = useTranslation();

  return (
    <div
      onClick={() => onClick?.(paperId)}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '16px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{
        fontSize: '10px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--accent-silver)',
        background: 'var(--badge-bg)',
        border: '1px solid var(--badge-border)',
        padding: '2px 7px',
        borderRadius: '4px',
        display: 'inline-block',
        marginBottom: '8px',
      }}>
        {category}
      </div>
      <div style={{
        fontSize: '13px',
        fontWeight: 600,
        color: 'var(--text-primary)',
        lineHeight: 1.4,
        marginBottom: '6px',
      }}>
        {title}
      </div>
      <div style={{
        fontSize: '11px',
        color: 'var(--text-secondary)',
        marginBottom: '10px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {authors}
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        paddingTop: '10px',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: '10px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-muted)',
      }}>
        <span>{publishedDate}</span>
        <span>{mathCount} {language === 'vi' ? 'công thức' : 'formulas'}</span>
        <span>{wordCount} {language === 'vi' ? 'từ' : 'words'}</span>
      </div>
    </div>
  );
};
