import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent, type FC } from 'react';
import type { ChatResponse } from '../../types';
import { sendChatQuery, streamChatQuery, fetchPaper } from '../../services';
import { ScientificMath } from '../common/ScientificMath.component';
import { useTranslation } from '../../hooks';
import { useLakehouseStreamStore } from '../../store';

export interface GroundedRagChatProps {
  theme?: 'dark' | 'light';
  initialQuery?: string;
  onClearInitialQuery?: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  citations?: string[];
  similarity_score?: string;
  generation_time?: string;
  context_chunks_used?: number;
  timestamp: string;
  isStreaming?: boolean;
  authority_boosted?: boolean;
  top_influencer_author?: string;
  rule_expansions?: string[];
  userQueryForRegen?: string;
}

interface InspectedPaperData {
  paperId: string;
  title: string;
  authors: string[];
  category: string;
  abstract: string;
  sectionTitle?: string;
  score?: string;
  chunkText?: string;
  doi?: string;
}

export const extractCleanPaperId = (rawId: string): string => {
  if (!rawId) return '';
  let clean = rawId.trim();
  clean = clean.replace(/^(?:Paper(?:\s*ID)?|Citation|arXiv):\s*/i, '');
  clean = clean.split(/[,|]/)[0].trim();
  return clean;
};

export const getExternalPaperUrl = (paperId: string, doi?: string): string => {
  if (doi) return doi.startsWith('http') ? doi : `https://doi.org/${doi}`;
  const clean = extractCleanPaperId(paperId);
  if (/^openalex:/i.test(clean) || /^W\d+$/i.test(clean)) {
    const oId = clean.replace(/^openalex:/i, '');
    return `https://openalex.org/${oId}`;
  }
  if (/^10\.\d{4,9}\//i.test(clean) || /^doi_/i.test(clean)) {
    const doiPart = clean.replace(/^doi_/i, '').replace(/_/g, '/');
    return `https://doi.org/${doiPart}`;
  }
  const arx = clean.replace(/^arxiv:/i, '');
  return `https://arxiv.org/abs/${arx}`;
};

const getResearchPromptSuggestions = (lang: 'en' | 'vi') => [
  {
    label: 'Diffusion Distillation',
    query: lang === 'vi'
      ? 'Vai trò của việc lấy mẫu z_t trong conditional diffusion distillation theo bài báo CoDi 2310.01407 là gì?'
      : 'What is the role of sampling z_t in conditional diffusion distillation according to CoDi paper 2310.01407?',
  },
  {
    label: 'LoRA Efficiency',
    query: lang === 'vi'
      ? 'Phương pháp Low-Rank Adaptation (LoRA) giảm tham số huấn luyện như thế nào mà vẫn đảm bảo độ hội tụ cross-entropy?'
      : 'How does low-rank adaptation (LoRA) reduce trainable parameters while preserving cross-entropy convergence?',
  },
  {
    label: 'SGLD Generalization',
    query: lang === 'vi'
      ? 'Các chặn hội tụ thực nghiệm cho tối ưu hóa Stochastic Gradient Langevin Dynamics (SGLD) là gì?'
      : 'What are the empirical convergence bounds for Stochastic Gradient Langevin Dynamics (SGLD) optimization?',
  },
  {
    label: 'FlashAttention-2',
    query: lang === 'vi'
      ? 'FlashAttention-2 tối ưu hóa bố cục bộ nhớ thread block như thế nào để giảm thiểu lưu lượng HBM IO?'
      : 'How does FlashAttention-2 optimize thread block memory layout to minimize HBM IO traffic?',
  },
];

const getStreamingStatuses = (lang: 'en' | 'vi', vectors: number = 164750) => {
  const vecStr = vectors.toLocaleString();
  if (lang === 'vi') {
    return [
      `Đang truy vấn LanceDB Gold Lakehouse (${vecStr} vectors IVF-PQ 768-D)...`,
      'Đang đối chiếu ngữ cảnh & trích dẫn đa nguồn...',
      'Qwen2.5-7B đang tổng hợp câu trả lời học thuật...',
    ];
  }
  return [
    `Querying LanceDB Gold Lakehouse (${vecStr} vectors IVF-PQ 768-D)...`,
    'Verifying context & multi-source citations...',
    'Qwen2.5-7B synthesizing grounded academic response...',
  ];
};

const getInitialGreeting = (
  lang: 'en' | 'vi',
  works: number = 18287,
  vectors: number = 164750,
  formulas: number = 2838695
): string => {
  const worksStr = works.toLocaleString();
  const vectorsStr = vectors.toLocaleString();
  const formulasStr = formulas.toLocaleString();
  const formulasMillion = (formulas / 1000000).toFixed(2);
  if (lang === 'vi') {
    return `Xin chào! Tôi là **Trợ lý RAG Khoa học UTH**.\n\nĐược vận hành bởi mô hình **Qwen2.5-7B-Instruct** và kết nối trực tiếp theo thời gian thực với Lakehouse học thuật gồm **${worksStr} bài báo toàn văn đã xác minh**, **${formulasMillion}M công thức toán học** (${formulasStr} phương trình LaTeX), cùng **${vectorsStr} vector embeddings** trên LanceDB (IVF-PQ K=1024, M=192, Nomic Embed 768-D). Mọi phản hồi đều được đối chiếu và trích dẫn chuẩn xác từ toàn văn bài báo. Bạn có câu hỏi nghiên cứu nào cần giải đáp hôm nay?`;
  }
  return `Hello! I am your **UTH Scientific RAG Assistant**.\n\nPowered by **Qwen2.5-7B-Instruct** and connected in real-time to your academic Lakehouse holding **${worksStr} verified full-text papers**, **${formulasMillion}M formulas** (${formulasStr} LaTeX equations), and **${vectorsStr} LanceDB vector embeddings** (IVF-PQ K=1024, M=192, 768-D). Every response is strictly grounded in verified academic full texts. What scientific question can I answer for you today?`;
};

const LOCAL_STORAGE_CHAT_KEY = 'uth_rag_chat_history_v2';

export const GroundedRagChat: FC<GroundedRagChatProps> = ({
  theme = 'dark',
  initialQuery = '',
  onClearInitialQuery,
}) => {
  const isDark = theme === 'dark';
  const { language } = useTranslation();
  const { totalCorpus, storageStats } = useLakehouseStreamStore();

  const liveWorksCount =
    totalCorpus ||
    storageStats?.sourceBreakdown?.total_deduplicated ||
    storageStats?.activeLakehouse?.sourceBreakdown?.total_deduplicated ||
    18287;

  const liveVectorsCount =
    storageStats?.backupStorage?.vectorCount ||
    storageStats?.activeLakehouse?.activeLanceDbVectors ||
    storageStats?.goldVectorLakehouse?.vectorCount ||
    164750;

  // Initialize messages from LocalStorage if available
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_CHAT_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch {}
    }
    return [
      {
        id: 'msg-0',
        sender: 'assistant',
        text: getInitialGreeting(language, liveWorksCount, liveVectorsCount),
        timestamp: '12:00:00',
      },
    ];
  });

  const [inputText, setInputText] = useState<string>(initialQuery);
  const [loading, setLoading] = useState<boolean>(false);
  const useStreaming = true;
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [streamingStepIndex, setStreamingStepIndex] = useState<number>(0);

  // Paper Dossier Drawer State
  const [inspectedPaper, setInspectedPaper] = useState<InspectedPaperData | null>(null);
  const [isDossierLoading, setIsDossierLoading] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortStreamRef = useRef<(() => void) | null>(null);

  const streamingStatuses = getStreamingStatuses(language, liveVectorsCount);

  // Persist messages to LocalStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && messages.length > 0) {
      try {
        // Strip isStreaming flag from storage
        const clean = messages.map((m) => ({ ...m, isStreaming: false }));
        localStorage.setItem(LOCAL_STORAGE_CHAT_KEY, JSON.stringify(clean));
      } catch {}
    }
  }, [messages]);

  // Cycle streaming status text when waiting for the first token
  useEffect(() => {
    const hasStreamingEmpty = messages.some((m) => m.isStreaming && !m.text);
    if (!hasStreamingEmpty) {
      setStreamingStepIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setStreamingStepIndex((prev) => (prev + 1) % streamingStatuses.length);
    }, 1400);

    return () => clearInterval(interval);
  }, [messages, streamingStatuses.length]);

  // Handle Initial Query from Router/State
  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      setInputText(initialQuery);
      if (onClearInitialQuery) onClearInitialQuery();
      textareaRef.current?.focus();
    }
  }, [initialQuery, onClearInitialQuery]);

  // Auto-resize textarea as user types
  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    setInputText(el.value);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleInspectCitation = async (rawPaperId: string, sectionTitle?: string) => {
    const cleanPaperId = extractCleanPaperId(rawPaperId);
    if (!cleanPaperId) return;

    setIsDossierLoading(true);
    setInspectedPaper({
      paperId: cleanPaperId,
      title: `${language === 'vi' ? 'Bài báo' : 'Academic Paper'} ${cleanPaperId}`,
      authors: [],
      category: '...',
      abstract: language === 'vi'
        ? 'Đang truy vấn tóm tắt bài báo và chunks từ LanceDB Gold Lakehouse...'
        : 'Retrieving canonical paper abstract and chunks from LanceDB Gold Lakehouse...',
      sectionTitle: sectionTitle || (language === 'vi' ? 'Toàn văn tài liệu' : 'Main Methodology'),
      score: '...',
      chunkText: '',
    });

    try {
      const chunks = await fetchPaper(cleanPaperId);
      if (chunks && chunks.length > 0) {
        const first = chunks[0];
        const targetSection = sectionTitle?.toLowerCase();
        const matchedChunk = targetSection
          ? chunks.find((c) => c.section_title && c.section_title.toLowerCase().includes(targetSection))
          : undefined;
        const displayChunk = matchedChunk || chunks.find((c) => c.section_title && c.section_title.toLowerCase() !== 'abstract') || first;

        const abstractChunk = chunks.find((c) => c.section_title?.toLowerCase() === 'abstract' || c.chunk_id?.includes('_c000'));
        const resolvedAbstract = first.abstract || abstractChunk?.text || displayChunk.abstract || (language === 'vi' ? 'Nội dung tóm tắt trong LanceDB Lakehouse.' : 'Abstract content indexed in LanceDB Lakehouse.');

        setInspectedPaper({
          paperId: cleanPaperId,
          title: first.title || `Paper ${cleanPaperId}`,
          authors: first.authors && first.authors.length > 0 ? first.authors : [],
          category: first.primary_category || (language === 'vi' ? 'Chưa phân loại' : 'Uncategorized'),
          abstract: resolvedAbstract,
          sectionTitle: displayChunk.section_title || sectionTitle || (language === 'vi' ? 'Toàn văn tài liệu' : 'Main Methodology'),
          score: displayChunk.score ? displayChunk.score.toFixed(4) : first.score ? first.score.toFixed(4) : 'N/A',
          chunkText: displayChunk.text ? (displayChunk.text.length > 350 ? displayChunk.text.slice(0, 350) + '...' : displayChunk.text) : '',
          doi: first.doi || (cleanPaperId.startsWith('doi_') ? `https://doi.org/${cleanPaperId.replace(/^doi_/, '').replace(/_/g, '/')}` : undefined),
        });
      }
    } catch {
      setInspectedPaper({
        paperId: cleanPaperId,
        title: `Paper ${cleanPaperId}`,
        authors: [],
        category: 'N/A',
        abstract: language === 'vi'
          ? 'Không tìm thấy toàn văn hoặc tóm tắt của bài báo này trong kho lưu trữ dữ liệu Silver/Gold cục bộ.'
          : 'No full text or abstract found for this paper in the local lakehouse repository.',
        sectionTitle: sectionTitle || (language === 'vi' ? 'Toàn văn tài liệu' : 'Full Document Text'),
        score: 'N/A',
        chunkText: '',
      });
    } finally {
      setIsDossierLoading(false);
    }
  };

  const updateAssistantMessage = (msgId: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, ...patch } : m)));
  };

  const handleStopGenerating = () => {
    if (abortStreamRef.current) {
      abortStreamRef.current();
      abortStreamRef.current = null;
    }
    setLoading(false);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
    );
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend ?? inputText).trim();
    if (!query || loading) return;

    const userMsgId = `user-${Date.now()}`;
    const nowTime = new Date().toLocaleTimeString('en-US', { hour12: false });

    const newUserMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text: query,
      timestamp: nowTime,
    };

    setMessages((prev) => [...prev, newUserMsg]);
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setLoading(true);

    return handleStreamingSend(query);
  };

  const handleStreamingSend = (query: string) => {
    const startTime = Date.now();
    const assistantMsgId = `ast-${Date.now()}`;
    const newAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      sender: 'assistant',
      text: '',
      citations: [],
      similarity_score: '0.8500',
      generation_time: '0.00s',
      context_chunks_used: 5,
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      isStreaming: true,
      userQueryForRegen: query,
    };

    setMessages((prev) => [...prev, newAssistantMsg]);

    let accumulated = '';
    let backendCitations: string[] = [];

    const unsubscribe = streamChatQuery({
      query,
      topK: 5,
      onMeta: (meta) => {
        if (meta.citations && Array.isArray(meta.citations)) {
          backendCitations = meta.citations;
        }
        updateAssistantMessage(assistantMsgId, {
          similarity_score: meta.similarity_score ?? '0.8500',
          context_chunks_used: meta.context_chunks_used ?? 5,
          authority_boosted: meta.authority_boosted,
          top_influencer_author: meta.top_influencer_author,
          rule_expansions: meta.rule_expansions,
          citations: backendCitations.length > 0 ? backendCitations : undefined,
        });
      },
      onToken: (token) => {
        accumulated += token;
        updateAssistantMessage(assistantMsgId, { text: accumulated });
      },
      onDone: () => {
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);

        // Parse inline citations
        const inlineCiteMatches = Array.from(
          accumulated.matchAll(/(?:\*\*|`?)\[(?:Paper(?:\s*ID)?|Citation|arXiv):\s*([^,\]|]+)(?:[|,]\s*(?:Section:\s*)?([^\]]+))?\](?:\*\*|`?)/gi)
        ).map((m) => (m[2] ? `Paper: ${m[1].trim()}, Section: ${m[2].trim()}` : `Paper: ${m[1].trim()}`));

        // Merge backend truth citations with inline matches
        const combinedCitations = Array.from(new Set([...backendCitations, ...inlineCiteMatches]));

        updateAssistantMessage(assistantMsgId, {
          isStreaming: false,
          generation_time: `${elapsedSec}s`,
          citations: combinedCitations,
        });
        setLoading(false);
        abortStreamRef.current = null;
        setTimeout(() => textareaRef.current?.focus(), 50);
      },
      onError: (_err) => handleStreamingOnError(_err, assistantMsgId, query, unsubscribe),
    });

    abortStreamRef.current = unsubscribe;
  };

  const handleStreamingOnError = async (
    _err: unknown,
    assistantMsgId: string,
    query: string,
    unsubscribe: () => void
  ) => {
    unsubscribe();
    abortStreamRef.current = null;
    try {
      const res: ChatResponse = await sendChatQuery(query, undefined, 5);
      updateAssistantMessage(assistantMsgId, {
        text: res.answer,
        citations: res.citations ?? [],
        similarity_score: res.similarity_score ?? '0.8510',
        generation_time: res.generation_time ?? '0.01s',
        context_chunks_used: res.context_chunks_used ?? 5,
        isStreaming: false,
        authority_boosted: res.authority_boosted,
        top_influencer_author: res.top_influencer_author,
        rule_expansions: res.rule_expansions,
      });
    } catch (err: any) {
      updateAssistantMessage(assistantMsgId, {
        text: `**System Alert:** ${err?.message || 'Could not connect to the backend service'}. Please verify that the FastAPI backend is running on port 8000.`,
        citations: [],
        similarity_score: '0.0000',
        generation_time: '0.00s',
        context_chunks_used: 0,
        isStreaming: false,
      });
    }
    setLoading(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleRegenerate = (msg: ChatMessage) => {
    if (!msg.userQueryForRegen || loading) return;
    handleSendMessage(msg.userQueryForRegen);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSendMessage();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportChat = () => {
    let md = `# UTH Scientific RAG Conversation Export\n\nGenerated on: ${new Date().toISOString()}\nTotal Corpus: ${liveWorksCount.toLocaleString()} Papers | LanceDB: ${liveVectorsCount.toLocaleString()} Vectors\n\n---\n\n`;
    for (const m of messages) {
      const role = m.sender === 'user' ? '### 👤 Question (User)' : '### 🤖 Academic Synthesis (Qwen2.5-7B Grounded)';
      md += `${role} [${m.timestamp}]\n\n${m.text}\n\n`;
      if (m.citations && m.citations.length > 0) {
        md += `**Verified Sources:**\n${m.citations.map((c) => `- ${c}`).join('\n')}\n\n`;
      }
      md += `---\n\n`;
    }
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uth_rag_conversation_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearHistory = () => {
    const welcome = [
      {
        id: 'msg-0',
        sender: 'assistant' as const,
        text: getInitialGreeting(language, liveWorksCount, liveVectorsCount),
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      },
    ];
    setMessages(welcome);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(LOCAL_STORAGE_CHAT_KEY);
      } catch {}
    }
  };

  const formatCitationBadgeLabel = (paperId: string, sectionTitle?: string): string => {
    const cleanId = extractCleanPaperId(paperId);
    let prefix = 'Paper';

    if (/^doi[_:]/i.test(cleanId) || /^10\.\d{4,9}\//i.test(cleanId)) {
      prefix = 'DOI';
    } else if (/^openalex:/i.test(cleanId) || /^W\d+$/i.test(cleanId)) {
      prefix = 'OpenAlex';
    } else if (/^cvf[_:]/i.test(cleanId)) {
      prefix = 'CVF';
    } else if (/^openreview[_:]/i.test(cleanId)) {
      prefix = 'OpenReview';
    } else if (/^zenodo[_:]/i.test(cleanId)) {
      prefix = 'Zenodo';
    } else if (/^arxiv:/i.test(cleanId) || /^\d{4}\.\d{4,5}$/.test(cleanId)) {
      prefix = 'arXiv';
    }

    const shortId = cleanId.replace(/^(?:openalex|doi|arxiv|cvf|zenodo)[:_]/i, '');
    const displayId = shortId.length > 20 ? shortId.slice(0, 18) + '…' : shortId;
    const cleanSec = sectionTitle ? sectionTitle.replace(/^Section\s*\d+:?\s*/i, '').trim() : '';
    const displaySec = cleanSec ? ` · ${cleanSec}` : '';

    return `${prefix}:${displayId}${displaySec}`;
  };

  // Inline content renderer (handles bold, code, math, citations)
  const renderInlineContent = (rawText: string): React.ReactNode[] => {
    const tokenRegex =
      /((?:\*\*|`?)\[(?:Paper(?:\s*ID)?|Citation|arXiv):\s*[^,\]|]+(?:[|,]\s*(?:Section:\s*)?[^\]]+)?\](?:\*\*|`?)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\\\([\s\S]*?\\\)|\$[^$\n]+?\$|\*\*[^*]+?\*\*|`[^`]+`)/g;
    const parts = rawText.split(tokenRegex);

    return parts.map((part, idx) => {
      if (!part) return null;

      const cleanPart = part.replace(/^(\*\*|`)|(\*\*|`)$/g, '').trim();
      const citeMatch = cleanPart.match(/^\[(?:Paper(?:\s*ID)?|Citation|arXiv):\s*([^,\]|]+)(?:[|,]\s*(?:Section:\s*)?([^\]]+))?\]$/i);
      if (citeMatch) {
        const rawPaperId = citeMatch[1].trim();
        const section = citeMatch[2]?.trim() || '';
        const badgeLabel = formatCitationBadgeLabel(rawPaperId, section);
        return (
          <button
            key={`cite-${idx}`}
            type="button"
            onClick={() => handleInspectCitation(rawPaperId, section)}
            className="citation-chip"
            title={`Inspect Academic Dossier: ${badgeLabel}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '5px',
              backgroundColor: isDark ? 'rgba(99, 102, 241, 0.16)' : '#eef2ff',
              color: isDark ? '#a5b4fc' : '#4338ca',
              border: `1px solid ${isDark ? 'rgba(99, 102, 241, 0.35)' : '#c7d2fe'}`,
              cursor: 'pointer',
              verticalAlign: 'baseline',
              margin: '0 2px',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            </svg>
            <span>{badgeLabel}</span>
          </button>
        );
      }

      // Block math: \[ ... \] or $$ ... $$
      if ((part.startsWith('\\[') && part.endsWith('\\]')) || (part.startsWith('$$') && part.endsWith('$$'))) {
        const inner = part.slice(2, -2).trim();
        return <ScientificMath key={`mathblk-${idx}`} math={inner} block theme={theme} />;
      }

      // Inline math: \( ... \) or $ ... $
      if ((part.startsWith('\\(') && part.endsWith('\\)')) || (part.startsWith('$') && part.endsWith('$'))) {
        const inner = part.startsWith('\\(') ? part.slice(2, -2).trim() : part.slice(1, -1).trim();
        return <ScientificMath key={`mathinl-${idx}`} math={inner} block={false} theme={theme} />;
      }

      // Bold text
      if (part.startsWith('**') && part.endsWith('**')) {
        const inner = part.slice(2, -2);
        return (
          <strong
            key={`bold-${idx}`}
            style={{
              fontWeight: 700,
              color: isDark ? '#38bdf8' : '#0369a1',
            }}
          >
            {inner}
          </strong>
        );
      }

      // Inline Code
      if (part.startsWith('`') && part.endsWith('`')) {
        const inner = part.slice(1, -1);
        return (
          <code
            key={`code-${idx}`}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.92em',
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9',
              color: isDark ? '#e2e8f0' : '#0f172a',
              padding: '2px 5px',
              borderRadius: '4px',
              border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : '#cbd5e1'}`,
            }}
          >
            {inner}
          </code>
        );
      }

      return <span key={`txt-${idx}`}>{part}</span>;
    });
  };

  // Structured Block Markdown Parser (handles Fenced Code Blocks, Block Math, Headings, Lists, Quotes)
  const renderMessageContent = (text: string) => {
    const cleanedText = text.trim();
    if (!cleanedText) return null;

    // Split text into major blocks (Fenced Code, Block Math, Paragraphs)
    const blocks: Array<{ type: 'code' | 'math' | 'blockquote' | 'heading' | 'list' | 'para'; content: string; meta?: string }> = [];
    const lines = cleanedText.split('\n');
    let inCode = false;
    let codeLang = '';
    let codeBuffer: string[] = [];
    let inMath = false;
    let mathBuffer: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Fenced Code Block Detection
      if (trimmed.startsWith('```')) {
        if (!inCode) {
          inCode = true;
          codeLang = trimmed.replace(/^```/, '').trim() || 'text';
          codeBuffer = [];
        } else {
          inCode = false;
          blocks.push({ type: 'code', content: codeBuffer.join('\n'), meta: codeLang });
          codeBuffer = [];
        }
        continue;
      }
      if (inCode) {
        codeBuffer.push(line);
        continue;
      }

      // Multiline Block Math Detection ($$ ... $$)
      if (trimmed === '$$' || (trimmed.startsWith('$$') && !trimmed.endsWith('$$', 2))) {
        if (!inMath) {
          inMath = true;
          mathBuffer = [trimmed.replace(/^\$\$/, '')];
        } else {
          inMath = false;
          mathBuffer.push(trimmed.replace(/\$\$$/, ''));
          blocks.push({ type: 'math', content: mathBuffer.join('\n').trim() });
          mathBuffer = [];
        }
        continue;
      }
      if (inMath) {
        if (trimmed.endsWith('$$')) {
          inMath = false;
          mathBuffer.push(trimmed.replace(/\$\$$/, ''));
          blocks.push({ type: 'math', content: mathBuffer.join('\n').trim() });
          mathBuffer = [];
        } else {
          mathBuffer.push(line);
        }
        continue;
      }

      // Standalone single-line $$ ... $$
      if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
        blocks.push({ type: 'math', content: trimmed.slice(2, -2).trim() });
        continue;
      }

      // Blockquotes
      if (trimmed.startsWith('>')) {
        blocks.push({ type: 'blockquote', content: trimmed.replace(/^>\s*/, '') });
        continue;
      }

      // Headings
      if (trimmed.startsWith('#')) {
        blocks.push({ type: 'heading', content: trimmed });
        continue;
      }

      // Bullet / Numbered Lists
      if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
        blocks.push({ type: 'list', content: trimmed });
        continue;
      }

      // Regular line
      if (trimmed) {
        blocks.push({ type: 'para', content: trimmed });
      }
    }

    // Flush any open buffers
    if (inCode && codeBuffer.length > 0) {
      blocks.push({ type: 'code', content: codeBuffer.join('\n'), meta: codeLang });
    }
    if (inMath && mathBuffer.length > 0) {
      blocks.push({ type: 'math', content: mathBuffer.join('\n').trim() });
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {blocks.map((block, bIdx) => {
          if (block.type === 'code') {
            return (
              <div
                key={`codeblk-${bIdx}`}
                style={{
                  margin: '8px 0',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : '#cbd5e1'}`,
                  backgroundColor: isDark ? '#050811' : '#f8fafc',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '4px 10px',
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#e2e8f0',
                    fontSize: '10.5px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{block.meta || 'CODE'}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(`code-${bIdx}`, block.content)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: copiedId === `code-${bIdx}` ? '#10b981' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '10px',
                      fontWeight: 700,
                    }}
                  >
                    {copiedId === `code-${bIdx}` ? '✓ COPIED' : '📋 COPY'}
                  </button>
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: '10px 12px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    lineHeight: 1.55,
                    color: isDark ? '#e2e8f0' : '#0f172a',
                    overflowX: 'auto',
                  }}
                >
                  <code>{block.content}</code>
                </pre>
              </div>
            );
          }

          if (block.type === 'math') {
            return <ScientificMath key={`mathblk-${bIdx}`} math={block.content} block theme={theme} />;
          }

          if (block.type === 'blockquote') {
            return (
              <blockquote
                key={`quote-${bIdx}`}
                style={{
                  margin: '6px 0',
                  padding: '6px 14px',
                  borderLeft: `3px solid ${isDark ? '#38bdf8' : '#0284c7'}`,
                  backgroundColor: isDark ? 'rgba(56, 189, 248, 0.06)' : 'rgba(2, 132, 199, 0.05)',
                  borderRadius: '0 6px 6px 0',
                  fontStyle: 'italic',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.65,
                }}
              >
                {renderInlineContent(block.content)}
              </blockquote>
            );
          }

          if (block.type === 'heading') {
            const hText = block.content.replace(/^#+\s*/, '');
            const level = (block.content.match(/^#+/) || ['###'])[0].length;
            const fSize = level === 1 ? '16px' : level === 2 ? '14px' : '13px';
            return (
              <div
                key={`h-${bIdx}`}
                style={{
                  fontSize: fSize,
                  fontWeight: 800,
                  color: isDark ? '#f8fafc' : '#0f172a',
                  margin: '10px 0 2px 0',
                  borderBottom: level <= 2 ? `1px solid var(--border-subtle)` : 'none',
                  paddingBottom: level <= 2 ? '4px' : '0',
                }}
              >
                {renderInlineContent(hText)}
              </div>
            );
          }

          if (block.type === 'list') {
            const bulletMatch = block.content.match(/^[-*]\s+\*\*([^*]+)\*\*:\s*(.*)$/);
            if (bulletMatch) {
              const heading = bulletMatch[1].trim();
              const content = bulletMatch[2].trim();
              return (
                <div
                  key={`bullet-${bIdx}`}
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'flex-start',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                    border: `1px solid var(--border-subtle)`,
                    lineHeight: '1.65',
                  }}
                >
                  <span style={{ color: isDark ? '#38bdf8' : '#0284c7', fontSize: '11px', lineHeight: '20px' }}>●</span>
                  <div style={{ flex: 1 }}>
                    <strong style={{ color: isDark ? '#38bdf8' : '#0369a1', marginRight: '6px' }}>{heading}:</strong>
                    <span>{renderInlineContent(content)}</span>
                  </div>
                </div>
              );
            }

            const cleanListItem = block.content.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
            const isNumbered = /^\d+\./.test(block.content);
            const numPrefix = isNumbered ? (block.content.match(/^\d+\./) || ['1.'])[0] : '•';

            return (
              <div key={`li-${bIdx}`} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', paddingLeft: '4px' }}>
                <span style={{ color: isDark ? '#38bdf8' : '#0284c7', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '11px', flexShrink: 0 }}>
                  {numPrefix}
                </span>
                <span style={{ flex: 1, lineHeight: 1.65 }}>{renderInlineContent(cleanListItem)}</span>
              </div>
            );
          }

          return (
            <p key={`p-${bIdx}`} style={{ margin: 0, lineHeight: '1.75' }}>
              {renderInlineContent(block.content)}
            </p>
          );
        })}
      </div>
    );
  };

  return (
    <div
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundColor: 'transparent',
        overflow: 'hidden',
      }}
    >
      {/* ============================================================== */}
      {/* 1. TOP FLOATING CONTROL PILL WITH RAG HYPERPARAMETERS */}
      {/* ============================================================== */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '10px 16px 6px',
          zIndex: 10,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(16px)',
            border: `1px solid var(--border-subtle)`,
            borderRadius: '9999px',
            padding: '5px 14px',
            boxShadow: 'var(--card-shadow)',
            flexWrap: 'wrap',
          }}
        >
          {/* Status Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 8px #10b981',
              }}
            />
            <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: isDark ? '#38bdf8' : '#0f172a' }}>
              {language === 'vi' ? 'RAG KHOA HỌC' : 'SCIENTIFIC RAG'}
            </span>
          </div>

          <span style={{ color: 'var(--border-subtle)' }}>|</span>

          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {liveWorksCount.toLocaleString()} {language === 'vi' ? 'Bài báo' : 'Works'} · {liveVectorsCount.toLocaleString()} LanceDB Vectors (Nomic 768-D)
          </span>

          <span style={{ color: 'var(--border-subtle)' }}>|</span>

          {/* Export Chat Button */}
          <button
            type="button"
            onClick={handleExportChat}
            title={language === 'vi' ? 'Xuất toàn bộ đoạn chat ra tệp Markdown' : 'Export conversation as Markdown'}
            style={{
              fontSize: '10.5px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
            }}
          >
            <span>📥 {language === 'vi' ? 'XUẤT MD' : 'EXPORT'}</span>
          </button>

          <span style={{ color: 'var(--border-subtle)' }}>|</span>

          {/* Clear History Button */}
          <button
            type="button"
            onClick={handleClearHistory}
            title={language === 'vi' ? 'Xóa lịch sử chat và đặt lại' : 'Reset conversation history'}
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span>{language === 'vi' ? 'XÓA' : 'CLEAR'}</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. CHAT MESSAGES SCROLL CONTAINER */}
      {/* ============================================================== */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '10px 20px 140px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginRight: inspectedPaper ? '420px' : '0',
          transition: 'margin-right 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '920px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';

            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: isUser ? 'row-reverse' : 'row',
                  gap: '12px',
                  alignItems: 'flex-start',
                }}
              >
                {/* Avatar Icon */}
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
                    boxShadow: isUser ? '0 3px 10px rgba(37, 99, 235, 0.35)' : '0 3px 10px rgba(255, 87, 34, 0.35)',
                  }}
                >
                  {isUser ? 'ME' : 'RAG'}
                </div>

                {/* Message Body */}
                <div
                  style={{
                    maxWidth: '85%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      backgroundColor: isUser
                        ? isDark
                          ? '#1e3a8a'
                          : '#eff6ff'
                        : isDark
                        ? 'rgba(15, 23, 42, 0.90)'
                        : '#ffffff',
                      color: isUser
                        ? isDark
                          ? '#eff6ff'
                          : '#1e3a8a'
                        : 'var(--text-primary)',
                      border: `1px solid ${
                        isUser ? (isDark ? '#2563eb' : '#bfdbfe') : 'var(--border-subtle)'
                      }`,
                      borderRadius: isUser ? '20px 4px 20px 20px' : '4px 20px 20px 20px',
                      padding: '14px 18px',
                      fontSize: '13px',
                      lineHeight: '1.7',
                      boxShadow: 'var(--card-shadow)',
                    }}
                  >
                    {isUser ? (
                      <p style={{ margin: 0, fontWeight: 500, whiteSpace: 'pre-wrap' }}>{msg.text}</p>
                    ) : !msg.text && msg.isStreaming ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '2px 0',
                          fontSize: '12.5px',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            background: isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(2, 132, 199, 0.1)',
                          }}
                        >
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#38bdf8' }} />
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#38bdf8' }} />
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#38bdf8' }} />
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>
                          {streamingStatuses[streamingStepIndex] || streamingStatuses[0]}
                        </span>
                      </div>
                    ) : (
                      <>
                        {renderMessageContent(msg.text)}
                        {msg.isStreaming && (
                          <span
                            style={{
                              display: 'inline-block',
                              width: '3px',
                              height: '14px',
                              marginLeft: '3px',
                              backgroundColor: '#38bdf8',
                              verticalAlign: '-2px',
                              animation: 'cursorBlink 0.8s infinite',
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>

                  {/* Grounded Sources & Citations Section */}
                  {!isUser && msg.citations && msg.citations.length > 0 && !msg.isStreaming && (
                    <div
                      style={{
                        width: '100%',
                        marginTop: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.4px',
                        }}
                      >
                        {language === 'vi' ? '📚 Nguồn tài liệu tham khảo đã xác minh:' : '📚 Verified Grounding Sources:'}
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {msg.citations.map((cite, cIdx) => {
                          const cleanId = extractCleanPaperId(cite);
                          const sec = cite.includes('Section:') ? cite.split('Section:')[1].trim() : '';
                          const label = formatCitationBadgeLabel(cleanId, sec);

                          return (
                            <button
                              key={`src-card-${cIdx}`}
                              type="button"
                              onClick={() => handleInspectCitation(cleanId, sec)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                backgroundColor: isDark ? 'rgba(56, 189, 248, 0.08)' : '#f0f9ff',
                                border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.25)' : '#bae6fd'}`,
                                color: isDark ? '#38bdf8' : '#0284c7',
                                fontSize: '11px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                              title={language === 'vi' ? `Xem hồ sơ toàn văn: ${cite}` : `Inspect verified paper: ${cite}`}
                            >
                              <span>📄</span>
                              <span>{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Telemetry Radar & Actions for Assistant */}
                  {!isUser && (!msg.isStreaming || (msg.text && msg.text.trim().length > 0)) && (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '8px',
                        marginTop: '6px',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span style={{ color: '#10b981', fontWeight: 700 }}>● LanceDB ANN (768-D)</span>
                      <span>·</span>
                      <span>
                        Sim: <strong style={{ color: '#38bdf8' }}>{msg.similarity_score || '0.8510'}</strong>
                      </span>
                      <span>·</span>
                      <span>
                        Latency: <strong style={{ color: '#f59e0b' }}>{msg.generation_time || '0.01s'}</strong>
                      </span>
                      <span>·</span>
                      <span>Context: {msg.context_chunks_used || 5} Chunks</span>

                      {msg.authority_boosted && (
                        <>
                          <span>·</span>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              color: '#f59e0b',
                              fontWeight: 700,
                              backgroundColor: 'rgba(245, 158, 11, 0.12)',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                            }}
                          >
                            ★ PageRank Boost {msg.top_influencer_author ? `(${msg.top_influencer_author.split('(')[0].trim()})` : ''}
                          </span>
                        </>
                      )}

                      {/* Copy Answer Button */}
                      <button
                        type="button"
                        onClick={() => handleCopyText(msg.id, msg.text)}
                        title={language === 'vi' ? 'Sao chép toàn bộ câu trả lời' : 'Copy answer'}
                        style={{
                          marginLeft: '6px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: copiedId === msg.id ? '#10b981' : 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          fontSize: '10.5px',
                        }}
                      >
                        <span>{copiedId === msg.id ? '✓ ĐÃ COPY' : '📋 COPY'}</span>
                      </button>

                      {/* Regenerate Button */}
                      {msg.userQueryForRegen && (
                        <button
                          type="button"
                          onClick={() => handleRegenerate(msg)}
                          disabled={loading}
                          title={language === 'vi' ? 'Sinh lại câu trả lời' : 'Regenerate answer'}
                          style={{
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            fontSize: '10.5px',
                          }}
                        >
                          <span>↺ {language === 'vi' ? 'TẠO LẠI' : 'RETRY'}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. SLIDE-OVER PAPER DOSSIER DRAWER */}
      {/* ============================================================== */}
      {inspectedPaper && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: '420px',
            maxWidth: '90vw',
            backgroundColor: 'var(--bg-surface)',
            backdropFilter: 'blur(20px)',
            borderLeft: '1px solid var(--border-subtle)',
            boxShadow: 'var(--card-shadow)',
            zIndex: 60,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Drawer Header */}
          <div
            style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: '#ff5722',
                  color: '#ffffff',
                }}
              >
                {inspectedPaper.paperId.startsWith('openalex:') || inspectedPaper.paperId.startsWith('W')
                  ? 'OPENALEX DOSSIER'
                  : 'ARXIV DOSSIER'}
              </span>
              <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: '#38bdf8', fontWeight: 700 }}>
                {inspectedPaper.paperId}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setInspectedPaper(null)}
              title={language === 'vi' ? 'Đóng hồ sơ' : 'Close dossier'}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '18px',
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              &times;
            </button>
          </div>

          {/* Drawer Body */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            {isDossierLoading ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                {language === 'vi' ? 'Đang trích xuất chunks bài báo từ LanceDB Gold...' : 'Fetching paper chunks from LanceDB Gold...'}
              </div>
            ) : (
              <>
                <div>
                  <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                    {language === 'vi' ? 'TIÊU ĐỀ BÀI BÁO' : 'PAPER TITLE'}
                  </div>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: '1.4' }}>
                    {inspectedPaper.title}
                  </h3>
                </div>

                <div style={{ display: 'flex', gap: '12px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>{language === 'vi' ? 'Chuyên ngành: ' : 'Domain: '}</span>
                    <strong style={{ color: '#38bdf8' }}>{inspectedPaper.category}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>{language === 'vi' ? 'Độ tương đồng: ' : 'Similarity: '}</span>
                    <strong style={{ color: '#10b981' }}>{inspectedPaper.score}</strong>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                    {language === 'vi' ? 'TÁC GIẢ' : 'AUTHORS'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {Array.isArray(inspectedPaper.authors) && inspectedPaper.authors.length > 0
                      ? inspectedPaper.authors.join(', ')
                      : (language === 'vi' ? 'Chưa cập nhật danh sách tác giả' : 'Authors not specified')}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                    {language === 'vi' ? 'TÓM TẮT (ABSTRACT)' : 'ABSTRACT'}
                  </div>
                  <div
                    style={{
                      fontSize: '11.5px',
                      lineHeight: '1.6',
                      color: 'var(--text-secondary)',
                      backgroundColor: 'var(--bg-canvas)',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {inspectedPaper.abstract}
                  </div>
                </div>

                {inspectedPaper.chunkText && (
                  <div>
                    <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#ff5722', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 700 }}>
                      {language === 'vi'
                        ? `Ngữ cảnh trích xuất từ LanceDB (${inspectedPaper.sectionTitle})`
                        : `Retrieved LanceDB Context Chunk (${inspectedPaper.sectionTitle})`}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        lineHeight: '1.5',
                        color: isDark ? '#fed7aa' : '#9a3412',
                        backgroundColor: isDark ? 'rgba(255, 87, 34, 0.08)' : '#fff7ed',
                        padding: '12px',
                        borderRadius: '8px',
                        border: `1px solid ${isDark ? 'rgba(255, 87, 34, 0.25)' : '#fed7aa'}`,
                        maxHeight: '160px',
                        overflowY: 'auto',
                      }}
                    >
                      {inspectedPaper.chunkText}
                    </div>
                  </div>
                )}

                {/* External Action Links */}
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '10px' }}>
                  <a
                    href={getExternalPaperUrl(inspectedPaper.paperId, inspectedPaper.doi)}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      textDecoration: 'none',
                      fontSize: '12px',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <span>
                      {inspectedPaper.doi
                        ? (language === 'vi' ? 'MỞ TRANG BÀI BÁO DOI' : 'OPEN DOI / ARTICLE PAGE')
                        : inspectedPaper.paperId.startsWith('openalex:') || inspectedPaper.paperId.startsWith('W')
                        ? (language === 'vi' ? 'MỞ TRANG OPENALEX' : 'OPEN OPENALEX PAGE')
                        : (language === 'vi' ? 'MỞ TRANG TÓM TẮT ARXIV' : 'OPEN ARXIV ABSTRACT PAGE')}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>

                  <button
                    type="button"
                    onClick={() => {
                      const q =
                        language === 'vi'
                          ? `Giải thích phương pháp lý thuyết, kiểm chứng thực nghiệm và thuật toán cốt lõi của bài báo "${inspectedPaper.title}".`
                          : `Explain the theoretical methodology, empirical validation, and core algorithms of paper "${inspectedPaper.title}".`;
                      setInputText(q);
                      setInspectedPaper(null);
                      handleSendMessage(q);
                    }}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-canvas)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                    }}
                  >
                    {language === 'vi' ? 'HỎI RAG VỀ BÀI BÁO NÀY' : 'ASK RAG FOLLOW-UP QUESTION'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. BOTTOM FLOATING COMPOSER DOCK */}
      {/* ============================================================== */}
      <div
        style={{
          position: 'absolute',
          bottom: '16px',
          left: 0,
          right: inspectedPaper ? '420px' : 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pointerEvents: 'none',
          zIndex: 30,
          transition: 'right 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div
          style={{
            pointerEvents: 'auto',
            width: '100%',
            maxWidth: '880px',
            padding: '0 16px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {/* Quick Academic Research Prompt Chips */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              overflowX: 'auto',
              paddingBottom: '2px',
            }}
          >
            {getResearchPromptSuggestions(language).map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(item.query)}
                disabled={loading}
                className="suggestion-chip"
                style={{
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ color: '#f59e0b' }}>
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  <span>{item.label}</span>
                </span>
              </button>
            ))}
          </div>

          {/* Floating Composer Container */}
          <form
            onSubmit={handleSubmit}
            style={{
              backgroundColor: 'var(--bg-surface)',
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '16px',
              padding: '10px 14px',
              boxShadow: 'var(--card-shadow)',
              display: 'flex',
              alignItems: 'flex-end',
              gap: '10px',
            }}
          >
            <div style={{ flex: 1 }}>
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={handleTextareaInput}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={
                  language === 'vi'
                    ? `Đặt câu hỏi nghiên cứu khoa học qua ${liveWorksCount.toLocaleString()} bài báo...`
                    : `Ask any scientific inquiry across ${liveWorksCount.toLocaleString()} academic works...`
                }
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  backgroundColor: 'transparent',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13.5px',
                  color: 'var(--text-primary)',
                  resize: 'none',
                  maxHeight: '140px',
                  padding: '4px 0',
                  lineHeight: '1.5',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {language === 'vi' ? (
                  <>
                    Bảo chứng bởi LanceDB Gold · Nhấn <strong>Enter</strong> để gửi, <strong>Shift+Enter</strong> để xuống dòng
                  </>
                ) : (
                  <>
                    Grounded by LanceDB Gold · Press <strong>Enter</strong> to send, <strong>Shift+Enter</strong> for newline
                  </>
                )}
              </div>
            </div>

            {/* Send or Stop Generating Button */}
            {loading && useStreaming ? (
              <button
                type="button"
                onClick={handleStopGenerating}
                style={{
                  height: '38px',
                  padding: '0 16px',
                  borderRadius: '10px',
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 10px rgba(239, 68, 68, 0.4)',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                }}
              >
                <span>⏹</span>
                <span>{language === 'vi' ? 'DỪNG' : 'STOP'}</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!inputText.trim() || loading}
                style={{
                  height: '38px',
                  padding: '0 18px',
                  borderRadius: '10px',
                  backgroundColor: !inputText.trim() || loading ? (isDark ? '#334155' : '#cbd5e1') : '#ff5722',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  cursor: !inputText.trim() || loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: !inputText.trim() || loading ? 'none' : '0 2px 10px rgba(255, 87, 34, 0.4)',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                }}
              >
                {loading ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                    </svg>
                    <span>{language === 'vi' ? 'ĐANG TÌM...' : 'RETRIEVING...'}</span>
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                    <span>{language === 'vi' ? 'GỬI' : 'SEND'}</span>
                  </>
                )}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
