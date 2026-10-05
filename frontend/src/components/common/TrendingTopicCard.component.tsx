import type { FC } from 'react';

export interface TrendingTopic {
  id: string;
  rank: number;
  title: string;
  category: string;
  growth: number;
  papers: number;
}

export interface TrendingTopicCardProps {
  topic: TrendingTopic;
  onClick?: (id: string) => void;
}

export const TrendingTopicCard: FC<TrendingTopicCardProps> = ({ topic, onClick }) => {
  const isPositive = topic.growth >= 0;
  return (
    <button
      type="button"
      onClick={() => onClick?.(topic.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 14px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
        textAlign: 'left',
        width: '100%',
      }}
    >
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        fontWeight: 800,
        color: 'var(--text-muted)',
        minWidth: '24px',
      }}>
        #{topic.rank}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {topic.title}
        </div>
        <div style={{
          fontSize: '10px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          marginTop: '2px',
        }}>
          {topic.category} · {topic.papers} papers
        </div>
      </div>
      <span style={{
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        fontWeight: 700,
        color: isPositive ? 'var(--accent-emerald)' : '#ef4444',
      }}>
        {isPositive ? '+' : ''}{topic.growth.toFixed(1)}%
      </span>
    </button>
  );
};

export const TrendingTopicCardTw: FC<TrendingTopicCardProps> = (props) => {
  return <TrendingTopicCard {...props} />;
};
