# KẾ HOẠCH TỐI ƯU HÓA CHI PHÍ & KIẾN TRÚC FRONTEND KẾT NỐI CLOUDFLARE R2
## (Zero-Cost & High-Performance Architecture Plan: Moving from Local Storage to R2 Lakehouse)

**Dự án**: UTH Scientific Data Mining & Advanced RAG System  
**Tài liệu**: Kế hoạch Tối ưu hóa Chi phí R2 & Kiến trúc Tích hợp Frontend  
**Vị trí lưu trữ**: [docs/R2_FRONTEND_COST_OPTIMIZATION_PLAN.md](file:///home/bush/Projects/UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS/docs/R2_FRONTEND_COST_OPTIMIZATION_PLAN.md)  
**Trạng thái**: Đã phê duyệt kiến trúc - Sẵn sàng triển khai  

---

## 1. ĐẶT VẤN ĐỀ VÀ PHÂN TÍCH RỦI RO CHI PHÍ

### 1.1. Hiện trạng và Định hướng chuyển đổi
- **Hiện trạng**: Frontend đang đọc dữ liệu từ local backend (FastAPI phục vụ file JSON cục bộ từ ổ cứng) và một phần lưu tạm qua Local Storage trên trình duyệt.
- **Mục tiêu chuyển đổi**: Thay thế lưu trữ cục bộ, chuyển sang tải các artifacts khai phá dữ liệu (EDA, 4 Pillars, Graph JSON, Parquet Metadata, Vector Chunks) trực tiếp hoặc gián tiếp từ **Cloudflare R2 Object Storage**.
- **Mối lo ngại cốt lõi**: Nếu frontend gửi request liên tục hoặc gọi trực tiếp lên Cloudflare R2, số lượng request sẽ bùng nổ (đặc biệt khi nhiều người dùng cùng truy cập hoặc polling theo thời gian thực), dẫn đến chi phí vượt ngưỡng miễn phí và phát sinh hóa đơn đám mây lớn ngoài tầm kiểm soát.

### 1.2. Cơ chế Định giá của Cloudflare R2 (R2 Pricing Mechanics)
Cloudflare R2 có chính sách định giá rất đặc thù so với AWS S3 hay Google Cloud Storage:

| Tiêu chí | Hạn mức Miễn phí hàng tháng (Free Tier) | Đơn giá khi vượt hạn mức | Đánh giá mức độ rủi ro |
| :--- | :--- | :--- | :--- |
| **Dung lượng lưu trữ (Storage)** | **10 GB / tháng** | $0.015 / GB-tháng | **Rất thấp**: Lakehouse hiện tại chỉ ~8.18 GB, nằm trọn trong 10 GB Free Tier. |
| **Băng thông tải ra (Egress Fees)** | **100% MIỄN PHÍ ($0.00)** | **$0.00 / GB (Zero Egress)** | **Hoàn toàn 0 đồng**: Đây là lợi thế tuyệt đối của Cloudflare R2. |
| **Thao tác Class A (Ghi/Liệt kê)** | **1,000,000 requests / tháng** | **$4.50 / 1,000,000 requests** | **RẤT CAO**: Các lệnh `PutObject`, `ListObjectsV2` có giá đắt gấp 12.5 lần Class B. |
| **Thao tác Class B (Đọc dữ liệu)** | **10,000,000 requests / tháng** | **$0.36 / 1,000,000 requests** | **TRUNG BÌNH**: Lệnh `GetObject`, `HeadObject`. Nếu polling sai cách sẽ vượt 10M nhanh chóng. |

### 1.3. Bẫy Chi phí Tiềm ẩn (Anti-Patterns cần tránh tuyệt đối)
1. **Frontend gọi trực tiếp R2 S3 API (Direct Client Fetch)**:
   - *Nguy cơ*: Phải nhúng AWS Access Key / Secret Key vào Client (vi phạm bảo mật nghiêm trọng).
   - *Nguy cơ chi phí*: Trình duyệt không thể tận dụng Edge Caching toàn cầu nếu gọi qua S3 endpoint xác thực SigV4.
2. **Gọi lệnh `ListObjectsV2` để kiểm tra file mới**:
   - `ListObjects` được Cloudflare tính là **Class A** ($4.50/M). Nếu 1,000 người dùng polling list bucket mỗi 10 giây:
     $$\frac{1000 \times 3600 \times 24 \times 30}{10} = 259,200,000 \text{ requests Class A} \implies \text{Hóa đơn} \approx \$1,166 \text{ / tháng!}$$
3. **Polling dữ liệu thời gian thực lên R2**:
   - Dữ liệu streaming SSE có tần suất cao (vài giây/lần). Nếu frontend poll R2 để tìm bài báo mới, 10 triệu lượt Class B miễn phí sẽ hết sạch trong vòng vài ngày.
4. **Không có HTTP Cache Header & ETag**:
   - Mỗi lần user F5 hoặc chuyển tab (EDA <-> Pillars <-> Bento), trình duyệt lại tải lại toàn bộ file JSON vài megabytes từ R2.

---

## 2. KIẾN TRÚC TỐI ƯU HÓA 5 TẦNG (THE 5-TIER ZERO-COST ARCHITECTURE)

Để đạt mục tiêu **Chi phí R2 = $0.00 / tháng** (vận hành 100% trong Free Tier) và đồng thời mang lại tốc độ tải trang dưới 50ms, hệ thống cần áp dụng mô hình 5 tầng sau:

```
[ FRONTEND CLIENTS (Trình duyệt) ]
       │
       ├─► 1. Tầng Client Cache: TanStack Query + IndexedDB (staleTime: 5m, 0 request khi chuyển tab)
       │
       ▼ (Chỉ request khi cache hết hạn hoặc lần đầu tải trang)
[ CLOUDFLARE EDGE CDN (Custom Domain) ]  ◄── Cache Hit Rate: 98% - 99.5% ($0.00)
       │
       ├─► Trả về tức thì từ 310+ Cloudflare PoPs toàn cầu (Hit: 0 request tới R2)
       │
       ▼ (Chỉ 0.5% request lọt qua khi Cache Miss)
[ FASTAPI BACKEND GATEWAY ]              ◄── Single-Flight In-Memory LRU Cache
       │
       ├─► Kiểm tra In-Memory RAM Cache (Hit: 0 request tới R2)
       │
       ▼ (Chỉ 1 request duy nhất tới R2 khi backend khởi động hoặc có đợt Recompute mới)
[ CLOUDFLARE R2 OBJECT STORAGE ]        ◄── Thực tế < 50,000 Class B / tháng (Hạn mức Free: 10,000,000)
```

---

### Tầng 1: Cloudflare Edge CDN Caching Layer (Tối ưu hóa cốt lõi)
- **Cơ chế**: Gắn **Custom Domain** (ví dụ: `lakehouse-cdn.yourdomain.com`) trực tiếp vào R2 Bucket thông qua Cloudflare Dashboard.
- **Lợi ích**:
  - Khi client gửi GET request qua Custom Domain, Cloudflare Edge tự động cache nội dung tĩnh tại hơn 310 data centers trên toàn cầu.
  - **Mọi request được phục vụ từ Cloudflare Edge Cache đều HOÀN TOÀN MIỄN PHÍ** (Zero Class B request gửi tới R2, Zero Egress fees).
  - R2 chỉ nhận đúng **1 request Class B** duy nhất khi Cloudflare Edge bị Cache Miss.
- **Cấu hình Cache-Control Header chuẩn**:
  - Đối với các file Mining Artifacts (`eda_summary.json`, `clusters.json`, `graph.json`, `trends.json`):
    ```http
    Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400
    ETag: W/"v20261008-36414"
    ```
    - `max-age=300`: Trình duyệt cache 5 phút không cần hỏi lại.
    - `s-maxage=3600`: Cloudflare Edge CDN cache 1 giờ.
    - `stale-while-revalidate=86400`: Khi cache hết hạn, Cloudflare Edge vẫn trả dữ liệu cũ ngay lập tức trong khi âm thầm tải bản mới từ R2 ở background (người dùng không phải chờ).

---

### Tầng 2: FastAPI Backend Smart Proxy & Single-Flight Memory Cache
Thay vì để Frontend gọi trực tiếp R2, Backend FastAPI đóng vai trò là **Read-Through Gateway**:
- **Cơ chế In-Memory TTL Cache**:
  - Backend sử dụng cache trong RAM (`cachetools.TTLCache` hoặc dictionary có TTL).
  - Khi có 1,000 users đồng thời mở trang EDA, chỉ đúng **1 request đầu tiên** gọi lên R2 để nạp dữ liệu vào RAM, 999 users còn lại được phục vụ trực tiếp từ RAM của server trong 0.2ms.
- **Single-Flight Lock (Chống Cache Stampede)**:
  - Nếu cache hết hạn đúng lúc có 50 requests đến cùng lúc, backend dùng `asyncio.Lock` để chỉ cho phép 1 task duy nhất tải từ R2, các task khác chờ kết quả mà không tạo ra 50 requests lên R2.
- **Cơ chế Chủ động Xóa Cache (Active Invalidation)**:
  - Khi người dùng bấm nút **RECOMPUTE 4 PILLARS** hoặc **SYNC LAKEHOUSE ML**, backend chạy mô hình xong sẽ gọi `mining_service.clear_cache()`. Lần request tiếp theo mới kéo dữ liệu mới từ R2 về.

---

### Tầng 3: Client-Side Caching (TanStack Query + IndexedDB)
Thay vì sử dụng LocalStorage (vốn chỉ có 5MB dung lượng, là API đồng bộ gây đơ giao diện UI khi parse JSON lớn):
1. **TanStack Query (React Query) với cấu hình thông minh**:
   - `staleTime: 5 * 60 * 1000` (5 phút): Dữ liệu mining và EDA là kết quả phân tích khối (Batch Machine Learning), không thay đổi theo từng giây. Đặt `staleTime` 5 phút ngăn chặn việc fetch lại mỗi khi người dùng chuyển qua lại giữa các tab `FLOW CANVAS`, `BENTO`, `EDA`, `PILLARS`.
   - `gcTime: 30 * 60 * 1000` (30 phút): Giữ dữ liệu trong bộ nhớ client để chuyển màn hình tức thì.
   - `refetchOnWindowFocus: false`: Không fetch lại chỉ vì người dùng click ra tab khác rồi quay lại.
2. **IndexedDB cho Dữ liệu Lớn (Large Graph & Scatter Points)**:
   - Đồ thị khoa học (Graph với 120 nodes, 243 edges) và tập điểm 2D SVD scatter có kích thước lớn.
   - Sử dụng thư viện siêu nhẹ `idb-keyval` (chỉ 600 bytes) để lưu trữ vào IndexedDB trên trình duyệt. Khi mở lại trình duyệt, frontend đọc từ IndexedDB trước, sau đó mới gửi request có header `If-None-Match` để kiểm tra có phiên bản mới hay không.
3. **HTTP 304 Not Modified**:
   - Khi frontend gửi `If-None-Match: <etag>`, nếu dữ liệu trên server/R2 chưa thay đổi, phản hồi trả về là `304 Not Modified` với kích thước body là 0 byte, không tốn băng thông parse JSON.

---

### Tầng 4: Event-Driven Real-Time Sync (SSE Push thay vì R2 Polling)
- **Nguyên tắc vàng**: **Tuyệt đối không để Frontend Polling R2 để lấy dữ liệu streaming.**
- **Cơ chế triển khai**:
  - Luồng dữ liệu thời gian thực được xử lý qua **Server-Sent Events (SSE)** tại `/api/stream/sse`.
  - Backend `streaming_service` stream trực tiếp từng bài báo mới vào RAM của Client (thông qua `useLakehouseStreamStore`).
  - Frontend tự động chiếu các bài báo này lên biểu đồ Scatter EDA và 2D Cluster Manifold của Pillar 2 trong bộ nhớ cục bộ mà không cần gửi bất kỳ request nào lên R2.
  - Khi có sự kiện Batch Mining hoàn tất, SSE bắn sự kiện `{ event: "MINING_UPDATED", version: "v20261008" }` để thông báo cho Frontend biết cần revalidate cache.

---

### Tầng 5: Manifest Registry (Triệt tiêu 100% Class A ListObjects)
- **Vấn đề**: Thao tác `ListObjectsV2` có giá đắt gấp 12.5 lần thao tác đọc file (`$4.50/M` so với `$0.36/M`).
- **Giải pháp**:
  - Không bao giờ cho phép Frontend hoặc Backend gọi lệnh liệt kê danh sách file (`list_objects`) trên R2.
  - Thay vào đó, Backend duy trì một file danh mục duy nhất: `lakehouse/manifest.json`.
  - File `manifest.json` chứa toàn bộ danh sách đường dẫn file, hash SHA-256, dung lượng byte và thời điểm cập nhật.
  - Mọi thao tác kiểm tra trạng thái Lakehouse chỉ cần đọc đúng 1 file `manifest.json` này (được tính là Class B hoặc được cache miễn phí tại Edge CDN).

---

## 3. TÍNH TOÁN VÀ SO SÁNH CHI PHÍ THỰC TẾ

### Bảng Mô phỏng: Kịch bản 1,000 Người Dùng Hoạt Động Hàng Ngày (1,000 DAU)
*Giả định: Mỗi người dùng mở dashboard 15 phút, thao tác giữa các tab EDA, Schematic, và 4 Pillars.*

| Chỉ số vận hành | Kịch bản Chưa tối ưu (Direct R2 Polling) | Kịch bản Đã tối ưu (5-Tier Architecture) | Mức độ giảm tải |
| :--- | :--- | :--- | :--- |
| **Số Class A Requests (Ghi / List)** | ~2,500,000 reqs/tháng (do poll list bucket) | **< 5,000 reqs/tháng** (chỉ ghi khi chạy mining) | **Giảm 99.8%** |
| **Hạn mức Class A miễn phí** | 1,000,000 reqs/tháng | 1,000,000 reqs/tháng | **Nằm trọn trong Free Tier** |
| **Chi phí Class A** | $6.75 / tháng | **$0.00 / tháng** | Tiết kiệm 100% |
| **Số Class B Requests (Đọc dữ liệu)** | ~18,000,000 reqs/tháng (do fetch liên tục) | **< 80,000 reqs/tháng** (99.5% hit CDN/RAM) | **Giảm 99.5%** |
| **Hạn mức Class B miễn phí** | 10,000,000 reqs/tháng | 10,000,000 reqs/tháng | **Nằm trọn trong Free Tier** |
| **Chi phí Class B** | $2.88 / tháng | **$0.00 / tháng** | Tiết kiệm 100% |
| **Dung lượng R2 lưu trữ** | 8.18 GB | 8.18 GB | Dưới hạn mức 10 GB Free |
| **Chi phí Lưu trữ** | $0.00 / tháng | **$0.00 / tháng** | 100% Free |
| **Băng thông tải ra (Egress)** | 0.00 GB (R2 Free Egress) | 0.00 GB (R2 Free Egress) | 100% Free |
| **TỔNG CHI PHÍ HÀNG THÁNG** | **~$10.00 - $25.00 / tháng** | **$0.00 / THÁNG (HOÀN TOÀN MIỄN PHÍ)** | **TỐI ƯU TUYỆT ĐỐI** |

---

## 4. KẾ HOẠCH TRIỂN KHAI THEO TỪNG GIAI ĐOẠN (ACTION PLAN)

```
[ GIAI ĐOẠN 1: BACKEND GATEWAY & MANIFEST ] ──► [ GIAI ĐOẠN 2: FRONTEND TANSTACK QUERY ] ──► [ GIAI ĐOẠN 3: CLOUDFLARE EDGE CDN ]
  • Triệt tiêu ListObjects                       • Cấu hình staleTime 5 phút                    • Gắn Custom Domain cho R2
  • In-Memory TTL Cache                          • Tích hợp IndexedDB cho Graph                 • Thiết lập Cache Rules Edge
  • Single-Flight Fetch Lock                     • Bắt sự kiện SSE invalidation                 • stale-while-revalidate 24h
```

### Giai đoạn 1: Chuẩn hóa Backend Gateway & Manifest Registry (Ưu tiên cao nhất)
1. **Triệt tiêu lệnh `ListObjects`**:
   - Sử dụng `r2_manifest.json` làm nguồn chân lý duy nhất cho danh sách file Lakehouse.
   - Khi worker upload file mới lên R2, worker tự động cập nhật `r2_manifest.json`.
2. **Triển khai In-Memory Cache tại FastAPI**:
   - Cài đặt `cachetools` trong backend:
     ```python
     from cachetools import TTLCache
     # Cache tối đa 50 file JSON, mỗi file lưu trong RAM 10 phút
     artifact_cache = TTLCache(maxsize=50, ttl=600)
     ```
   - Tạo endpoint Proxy `/api/lakehouse/artifacts/{filename}`:
     - Kiểm tra trong `artifact_cache`.
     - Nếu miss: Đọc từ local disk hoặc tải 1 lần từ R2 client, lưu vào cache, trả về cho frontend kèm header `ETag` và `Cache-Control`.

### Giai đoạn 2: Cấu hình Frontend Client Caching & IndexedDB
1. **Thiết lập TanStack Query Caching**:
   - Tạo custom hooks cho từng nhóm dữ liệu: `useEdaSummary()`, `useMiningClusters()`, `useScientificGraph()`, `useTrendVelocity()`.
   - Cấu hình chuẩn:
     ```typescript
     export const useEdaSummary = () => {
       return useQuery({
         queryKey: ['mining', 'eda'],
         queryFn: fetchEdaSummary,
         staleTime: 5 * 60 * 1000, // 5 phút không refetch
         gcTime: 30 * 60 * 1000,    // 30 phút giữ bộ nhớ đệm
         refetchOnWindowFocus: false,
       });
     };
     ```
2. **Lưu trữ Offline & Large Datasets bằng IndexedDB**:
   - Cài đặt `idb-keyval` cho đồ thị (Graph nodes/links) và các tập vector lớn.
   - Khi người dùng mở tab Graph hoặc K-Means, dữ liệu hiển thị tức thì trong 0ms từ IndexedDB trước khi thực hiện background verification.

### Giai đoạn 3: Cấu hình Cloudflare Custom Domain & Edge Cache (Khi đẩy lên Production Cloud)
1. **Gắn Custom Domain vào Bucket R2**:
   - Truy cập Cloudflare Dashboard -> **R2** -> Chọn Bucket `uth-data-mining-lakehouse` -> **Settings** -> **Custom Domains**.
   - Thêm tên miền phụ: `lake.yourdomain.com` (Cloudflare tự động cấp chứng chỉ SSL miễn phí).
2. **Tạo Cloudflare Cache Rule (Edge Caching)**:
   - Vào mục **Caching** -> **Cache Rules** -> Tạo rule mới:
     - **Matching Criteria**: `Hostname equals lake.yourdomain.com and URI Path contains /artifacts/`
     - **Edge TTL**: `Override origin` -> `1 hour`
     - **Browser TTL**: `Override origin` -> `5 minutes`
     - **Serve stale content**: `Enabled` (Phục vụ nội dung cũ khi đang cập nhật ngầm).

---

## 5. MẪU CODE TRIỂN KHAI MINH HỌA (REFERENCE IMPLEMENTATION)

### 5.1. Backend FastAPI: In-Memory Read-Through Proxy với ETag
```python
# backend/app/services/r2_proxy_service.py
import hashlib
import json
from typing import Dict, Any, Tuple
from cachetools import TTLCache

class R2ProxyService:
    def __init__(self):
        # Lưu tối đa 20 artifacts trong RAM, TTL 600 giây (10 phút)
        self._cache = TTLCache(maxsize=20, ttl=600)
        self._etags: Dict[str, str] = {}

    def get_artifact(self, artifact_name: str, if_none_match: str | None = None) -> Tuple[Dict[str, Any] | None, str, bool]:
        """
        Trả về (data, etag, is_not_modified).
        Nếu if_none_match khớp với ETag hiện tại -> is_not_modified = True (trả 304).
        """
        # 1. Kiểm tra RAM cache
        if artifact_name in self._cache:
            data = self._cache[artifact_name]
            etag = self._etags.get(artifact_name, "")
            if if_none_match and if_none_match == etag:
                return None, etag, True
            return data, etag, False

        # 2. Cache miss: Đọc từ R2 hoặc local gold storage
        # (Ở đây chỉ phát sinh đúng 1 request đọc duy nhất)
        data = self._load_from_r2_or_disk(artifact_name)
        
        # Tạo ETag từ hash nội dung
        content_bytes = json.dumps(data, sort_keys=True).encode('utf-8')
        etag = f'"{hashlib.md5(content_bytes).hexdigest()}"'
        
        self._cache[artifact_name] = data
        self._etags[artifact_name] = etag

        if if_none_match and if_none_match == etag:
            return None, etag, True

        return data, etag, False

    def clear(self):
        self._cache.clear()
        self._etags.clear()
```

### 5.2. Frontend: TanStack Query & Conditional Fetch Hook
```typescript
// frontend/src/hooks/useMiningArtifact.ts
import { useQuery } from '@tanstack/react-query';

export function useMiningArtifact<T>(artifactName: string) {
  return useQuery<T>({
    queryKey: ['r2-artifact', artifactName],
    queryFn: async () => {
      // Lưu ETag lần trước vào session storage
      const cachedEtag = sessionStorage.getItem(`etag-${artifactName}`);
      
      const headers: HeadersInit = {};
      if (cachedEtag) {
        headers['If-None-Match'] = cachedEtag;
      }

      const res = await fetch(`/api/lakehouse/artifacts/${artifactName}`, { headers });
      
      // Nếu server trả 304 Not Modified, lấy từ session cache
      if (res.status === 304) {
        const cachedBody = sessionStorage.getItem(`body-${artifactName}`);
        return cachedBody ? JSON.parse(cachedBody) : null;
      }

      if (!res.ok) throw new Error(`Lỗi tải artifact ${artifactName}: ${res.statusText}`);
      
      const etag = res.headers.get('ETag');
      const data = await res.json();
      
      if (etag) {
        sessionStorage.setItem(`etag-${artifactName}`, etag);
        sessionStorage.setItem(`body-${artifactName}`, JSON.stringify(data));
      }
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 phút không gửi request
    gcTime: 60 * 60 * 1000,    // 1 giờ giữ cache
    refetchOnWindowFocus: false,
  });
}
```

---

## 6. KẾT LUẬN VÀ KHUYẾN NGHỊ

1. **Hiệu quả kinh tế**:
   - Áp dụng mô hình **5-Tier Architecture** sẽ đảm bảo **100% chi phí Cloudflare R2 duy trì ở mức $0.00 / tháng**.
   - Tận dụng tối đa các hạn mức miễn phí: 10 GB lưu trữ miễn phí, 10,000,000 lượt đọc Class B miễn phí, và chính sách **Zero Egress Fees** độc quyền của Cloudflare.
2. **Hiệu năng trải nghiệm người dùng**:
   - Tốc độ tải giao diện EDA và 4 Mining Pillars giảm từ 300 - 800ms xuống còn **dưới 15ms** nhờ Edge CDN và TanStack Query.
   - Thao tác chuyển đổi tab giữa Flow Canvas, Bento, EDA và 4 Pillars diễn ra tức thì (0ms) do không bị re-fetch dữ liệu lặp lại.
3. **An toàn bảo mật**:
   - Không để lộ bất kỳ thông tin xác thực R2 credentials nào trên Client.
   - Toàn bộ kết nối được mã hóa và bảo vệ qua lớp proxy và Cloudflare DDoS/WAF.
