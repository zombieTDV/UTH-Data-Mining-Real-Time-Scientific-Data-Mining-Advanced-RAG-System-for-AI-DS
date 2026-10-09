from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class StorageZonesDto(BaseModel):
    bronzeCount: int = Field(..., examples=[11660])
    bronzeSizeBytes: int = Field(..., examples=[4040788866])
    openalexCount: int = Field(24754, examples=[24754])
    openalexSizeBytes: int = Field(4264028211, examples=[4264028211])
    openreviewCount: int = Field(1000, examples=[1000])
    openreviewSizeBytes: int = Field(26245976, examples=[26245976])
    cvfCount: int = Field(1000, examples=[1000])
    cvfSizeBytes: int = Field(2793757, examples=[2793757])
    silverTables: List[str] = Field(..., examples=[["papers.parquet"]])
    silverSizeBytes: int = Field(..., examples=[331411456])
    goldTables: List[str] = Field(..., examples=[["scientific_papers_gold.lance"]])
    goldChunkCount: int = Field(..., examples=[143523])
    goldSizeBytes: int = Field(..., examples=[127097720])
    goldBackupChunkCount: int = Field(28, examples=[28])
    goldBackupSizeBytes: int = Field(3295282176, examples=[3295282176])


class ActiveLakehouseDto(BaseModel):
    totalObjects: int = Field(36619, examples=[36619])
    totalSizeBytes: int = Field(8668472480, examples=[8668472480])
    totalSizeGb: float = Field(8.073, examples=[8.073])
    usedPercentage: float = Field(80.73, examples=[80.73])
    arxivHtmlCount: int = Field(11660, examples=[11660])
    arxivHtmlSizeBytes: int = Field(4040788866, examples=[4040788866])
    arxivHtmlSizeGb: float = Field(3.763, examples=[3.763])
    openalexCount: int = Field(24754, examples=[24754])
    openalexSizeBytes: int = Field(4264028211, examples=[4264028211])
    openalexSizeGb: float = Field(3.971, examples=[3.971])
    openreviewCount: int = Field(1000, examples=[1000])
    openreviewSizeBytes: int = Field(26245976, examples=[26245976])
    openreviewSizeMb: float = Field(25.03, examples=[25.03])
    cvfCount: int = Field(1000, examples=[1000])
    cvfSizeBytes: int = Field(2793757, examples=[2793757])
    cvfSizeMb: float = Field(2.66, examples=[2.66])
    silverParquetCount: int = Field(9, examples=[9])
    silverParquetSizeBytes: int = Field(331411456, examples=[331411456])
    silverParquetSizeMb: float = Field(316.06, examples=[316.06])
    conferenceCount: int = Field(2000, examples=[2000])
    activeLanceDbVectors: int = Field(143523, examples=[143523])
    activeLanceDbSizeBytes: int = Field(127097720, examples=[127097720])
    activeLanceDbSizeMb: float = Field(121.21, examples=[121.21])


class BackupStorageDto(BaseModel):
    totalObjects: int = Field(28, examples=[28])
    totalSizeBytes: int = Field(3295282176, examples=[3295282176])
    totalSizeGb: float = Field(3.069, examples=[3.069])
    description: str = Field("Cloud Disaster Recovery LanceDB Snapshots & Vector Backups on R2")


class TotalBucketDto(BaseModel):
    totalObjects: int = Field(36673, examples=[36673])
    totalSizeBytes: int = Field(11964057750, examples=[11964057750])
    totalSizeGb: float = Field(11.142, examples=[11.142])
    usedPercentage: float = Field(111.42, examples=[111.42])
    freeTierQuotaGb: float = Field(10.0)
    overageGb: float = Field(1.142, examples=[1.142])
    estimatedOverageCostUsd: float = Field(0.017, examples=[0.017])


class StorageStatsResponse(BaseModel):
    bucket: str = Field(..., examples=["uth-scientific-lakehouse"])
    status: str = Field(..., examples=["ready"])
    total_objects: int = Field(..., examples=[36673])
    total_size_bytes: int = Field(..., examples=[11964057750])
    total_size_gb: float = Field(..., examples=[11.142])
    free_tier_quota_gb: float = Field(10.0)
    used_percentage: float = Field(..., examples=[111.42])
    zones: StorageZonesDto
    remoteIndicesReady: bool = Field(True)
    activeLakehouse: ActiveLakehouseDto
    backupStorage: BackupStorageDto
    totalBucket: TotalBucketDto
    last_synced: Optional[str] = Field(None, examples=["2026-10-09 12:15:19"])
