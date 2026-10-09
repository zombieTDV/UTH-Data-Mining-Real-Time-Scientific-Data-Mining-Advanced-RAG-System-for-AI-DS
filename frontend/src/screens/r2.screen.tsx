import { useState, useEffect, useCallback, type FC } from 'react';
import type { AppTheme } from '../types';
import {
  R2StorageHud,
  R2FileTree,
  R2FileInspector,
  type R2FileItem,
  type FilePreviewData,
} from '../components/r2';
import { fetchR2Tree, syncR2Bucket, fetchFilePreview, type R2TreeResponseData } from '../services/r2/r2.service';

export interface R2ScreenProps {
  theme: AppTheme;
}

export const R2Screen: FC<R2ScreenProps> = () => {
  const [treeData, setTreeData] = useState<R2TreeResponseData | null>(null);
  const [selectedFile, setSelectedFile] = useState<R2FileItem | null>(null);
  const [previewData, setPreviewData] = useState<FilePreviewData | null>(null);
  const [isLoadingTree, setIsLoadingTree] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Load tree on initial mount (from disk cache, 0 remote cost)
  useEffect(() => {
    let isMounted = true;
    const loadTree = async () => {
      try {
        setIsLoadingTree(true);
        const data = await fetchR2Tree();
        if (!isMounted) return;
        setTreeData(data);

        // Auto-select first silver parquet file if available
        const defaultCandidate =
          data.zones.silver?.find((f) => f.name.includes('cvpr2024') || f.name.includes('papers')) ||
          data.zones.silver?.[0] ||
          data.zones.gold?.[0];

        if (defaultCandidate) {
          handleSelectFile(defaultCandidate);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setTreeError(err?.message || 'Failed to load R2 manifest cache');
      } finally {
        if (isMounted) setIsLoadingTree(false);
      }
    };

    loadTree();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectFile = useCallback(async (file: R2FileItem) => {
    setSelectedFile(file);
    setIsLoadingPreview(true);
    setPreviewError(null);
    try {
      const pData = await fetchFilePreview(file.key);
      setPreviewData(pData);
    } catch (err: any) {
      setPreviewError(err?.message || `Failed to extract preview for ${file.name}`);
      setPreviewData(null);
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

  const handleSyncRemoteSnapshot = async () => {
    setIsSyncing(true);
    setSyncNotice(null);
    try {
      const freshData = await syncR2Bucket();
      setTreeData(freshData);
      setSyncNotice(`Remote snapshot synchronized successfully (${freshData.total_objects.toLocaleString()} objects, ${freshData.total_size_gb.toFixed(2)} GB).`);
      setTimeout(() => setSyncNotice(null), 5000);
    } catch (err: any) {
      setSyncNotice(`Sync warning: ${err?.message || 'Failed to execute remote scan'}`);
      setTimeout(() => setSyncNotice(null), 6000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRetryPreview = () => {
    if (selectedFile) {
      handleSelectFile(selectedFile);
    }
  };

  if (isLoadingTree && !treeData) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '16px',
          color: 'var(--text-muted, #94a3b8)',
        }}
      >
        <div
          style={{
            width: '42px',
            height: '42px',
            border: '3px solid rgba(249, 115, 22, 0.2)',
            borderTopColor: '#f97316',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <div style={{ fontSize: '15px', fontWeight: 600 }}>Loading Cloudflare R2 Lakehouse Cache...</div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>Hydrating manifest from local disk snapshot (Zero S3 API cost)</div>
      </div>
    );
  }

  if (treeError && !treeData) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '12px',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div style={{ color: '#ef4444', fontSize: '16px', fontWeight: 700 }}>Lakehouse Manifest Offline</div>
        <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '13px', maxWidth: '420px' }}>{treeError}</div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '12px',
            padding: '8px 18px',
            borderRadius: '6px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#ef4444',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reload Dashboard
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        gap: '12px',
        padding: '12px 20px',
        minHeight: 0,
        boxSizing: 'border-box',
      }}
    >
      {/* Top HUD Component */}
      <R2StorageHud
        bucketName={treeData?.bucket_name || 'uth-scientific-lakehouse'}
        totalSizeGb={treeData?.total_size_gb || 12.18}
        totalObjects={treeData?.total_objects || 36440}
        freeTierQuotaGb={treeData?.free_tier_quota_gb || 10.0}
        usedPercentage={treeData?.used_percentage || 121.8}
        lastSynced={treeData?.last_synced || 'Local Disk Snapshot'}
        isSyncing={isSyncing}
        onSync={handleSyncRemoteSnapshot}
        classAOperations={treeData?.class_a_operations || '46.75k'}
        classBOperations={treeData?.class_b_operations || '113.58k'}
        storageClass={treeData?.storage_class || 'Standard'}
        publicAccess={treeData?.public_access || 'Enabled'}
        overageGb={treeData?.overage_gb || 2.18}
        estimatedOverageCostUsd={treeData?.estimated_overage_cost_usd || 0.033}
      />

      {/* Sync Notification Banner if any */}
      {syncNotice && (
        <div
          style={{
            padding: '8px 14px',
            borderRadius: '6px',
            backgroundColor: syncNotice.includes('warning')
              ? 'rgba(239, 68, 68, 0.15)'
              : 'rgba(16, 185, 129, 0.15)',
            border: `1px solid ${
              syncNotice.includes('warning') ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)'
            }`,
            color: syncNotice.includes('warning') ? '#ef4444' : '#10b981',
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{syncNotice}</span>
          <button
            onClick={() => setSyncNotice(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '14px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Dual-Pane Lakehouse Explorer */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          gap: '14px',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* Left Pane: Medallion Zone Tree */}
        <div
          style={{
            width: '360px',
            minWidth: '320px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <R2FileTree
            zones={treeData?.zones || {}}
            zoneStats={treeData?.zone_stats || {}}
            selectedKey={selectedFile?.key || null}
            onSelectFile={handleSelectFile}
          />
        </div>

        {/* Right Pane: File Inspector */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <R2FileInspector
            selectedFile={selectedFile}
            previewData={previewData}
            isLoading={isLoadingPreview}
            error={previewError}
            onRetry={handleRetryPreview}
          />
        </div>
      </div>
    </div>
  );
};
