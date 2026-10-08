import type { FC, ReactNode } from 'react';
import { useTranslation } from '../../hooks';

export interface ChatBubbleProps {
  isUser: boolean;
  isDark: boolean;
  isStreaming?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}

export const ChatBubble: FC<ChatBubbleProps> = ({
  isUser,
  isDark,
  isStreaming,
  children,
  footer,
}) => {
  const { language } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        gap: '14px',
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          width: '34px',
          height: '34px',
          borderRadius: isUser ? '50%' : '10px',
          backgroundColor: isUser ? '#2563eb' : '#ff5722',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          fontWeight: 800,
          flexShrink: 0,
          boxShadow: isUser
            ? '0 3px 10px rgba(37, 99, 235, 0.35)'
            : '0 3px 10px rgba(255, 87, 34, 0.35)',
        }}
      >
        {isUser ? (language === 'vi' ? 'BẠN' : 'YOU') : 'RAG'}
      </div>

      <div
        style={{
          maxWidth: '82%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        <div
          style={{
            backgroundColor: isUser
              ? (isDark ? '#1e3a8a' : '#eff6ff')
              : (isDark ? 'rgba(15, 23, 42, 0.88)' : '#ffffff'),
            color: isUser
              ? (isDark ? '#eff6ff' : '#1e3a8a')
              : (isDark ? '#f1f5f9' : '#0f172a'),
            border: `1px solid ${
              isUser
                ? (isDark ? '#2563eb' : '#bfdbfe')
                : (isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0')
            }`,
            borderRadius: isUser ? '20px 4px 20px 20px' : '4px 20px 20px 20px',
            padding: '16px 20px',
            fontSize: '13px',
            lineHeight: '1.7',
            boxShadow: isDark
              ? '0 4px 24px rgba(0, 0, 0, 0.3)'
              : '0 4px 20px rgba(0, 0, 0, 0.05)',
          }}
        >
          {children}

          {isStreaming && (
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '14px',
                marginLeft: '4px',
                backgroundColor: '#38bdf8',
                verticalAlign: 'middle',
                animation: 'pulseFlow 1s infinite',
              }}
            />
          )}
        </div>

        {footer && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '8px',
              marginTop: '8px',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
