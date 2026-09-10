# Cloudflare Setup for Classora

> Tài liệu tổng hợp cấu hình Cloudflare cho Classora production.  
> Domain chính hiện tại: `classora.io.vn`

---

## 1. Mục tiêu kiến trúc

Classora sử dụng:

- Cloudflare DNS
- Cloudflare Workers / Static Assets cho frontend
- Cloudflare Tunnel cho backend
- Docker Compose trên VPS
- NestJS cho API
- PostgreSQL cho database

Kiến trúc tổng thể:

```text
                    Cloudflare
                       │
          ┌────────────┴────────────┐
          │                         │
 app.classora.io.vn         api.classora.io.vn
          │                         │
          ▼                         ▼
 Cloudflare Workers          Cloudflare Tunnel
 / Static Assets                    │
          │                         ▼
      React/Vite              cloudflared
                                    │
                                    ▼
                                api:4101
                                    │
                                    ▼
                                  NestJS
                                    │
                                    ▼
                              postgres:5432
```

Port hiện tại:

```text
Frontend local/dev: 4100
Backend API:        4101
```

Frontend deploy trực tiếp lên Cloudflare nên không cần Tunnel cho port `4100`.

---

## 2. Domain và DNS

Domain chính:

```text
classora.io.vn
```

Domain đã:

- sử dụng nameserver của Cloudflare
- được quản lý DNS trên Cloudflare

Các hostname chính:

```text
classora.io.vn              → domain chính / landing page
app.classora.io.vn          → frontend Classora
api.classora.io.vn          → backend API
thayhanh.classora.io.vn     → tenant ví dụ
abc.classora.io.vn          → tenant khác
```

---

## 3. Setup frontend trên Cloudflare

GitHub repository:

```text
hoatepdev/classora
```

Project frontend:

```text
classora-web
```

Cấu trúc monorepo:

```text
classora/
├── apps/
│   ├── web/
│   └── api/
├── infrastructure/
└── docs/
```

Cấu hình build:

```text
Root directory / Path:
apps/web

Build command:
npm run build

Production branch:
main
```

Ý nghĩa của `Path = apps/web`:

```bash
cd apps/web
npm run build
```

Cloudflare sẽ chạy các lệnh build/deploy từ thư mục này.

---

## 4. Gắn domain cho frontend

Trong Cloudflare:

```text
Workers & Pages
→ classora-web
→ Settings
→ Domains & Routes
→ Add Custom Domain
```

Thêm:

```text
app.classora.io.vn
```

Kết quả:

```text
https://app.classora.io.vn
```

sẽ phục vụ frontend React/Vite của Classora.

---

## 5. Tạo Cloudflare Tunnel riêng

Trong Cloudflare:

```text
Networking
→ Tunnels
→ Create Tunnel
```

Tên Tunnel:

```text
classora-production
```

Chọn connector:

```text
cloudflared
```

Mục tiêu:

```text
Cloudflare
   ↓
classora-production
   ↓
VPS
```

Tunnel này chỉ dành cho môi trường production của Classora.

---

## 6. Chạy cloudflared bằng Docker

Không cần cài `cloudflared` trực tiếp lên VPS.

Cho `cloudflared` chạy cùng Docker Compose với:

```text
api
postgres
cloudflared
```

Lợi ích:

```text
cloudflared
    ↓
api:4101
```

`api` là Docker service name và được resolve bằng Docker internal DNS.

---

## 7. Lấy Tunnel Token

Cloudflare sẽ hiển thị command dạng:

```bash
docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token eyJ...
```

Chỉ lấy phần token:

```text
eyJ...
```

Lưu vào file `.env` trên VPS:

```env
CLOUDFLARE_TUNNEL_TOKEN=<your-tunnel-token>
```

Không commit token vào GitHub.

Không nhầm Tunnel Token với:

```text
Cloudflare API Token
Worker deployment token
```

Nếu log:

```text
Provided Tunnel token is not valid.
```

hãy kiểm tra lại token tại:

```text
classora-production
→ Add a replica
```

Sau khi cập nhật `.env`, recreate container:

```bash
docker compose up -d --force-recreate cloudflared
```

Kiểm tra log:

```bash
docker compose logs -f cloudflared
```

---

## 8. Docker Compose

Ví dụ cấu hình:

```yaml
services:
  api:
    build:
      context: ..
      dockerfile: apps/api/Dockerfile
    env_file: .env
    expose:
      - "4101"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - "fetch('http://127.0.0.1:4101/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    restart: unless-stopped

  postgres:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql
    healthcheck:
      test:
        - CMD-SHELL
        - "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:latest
    command:
      - tunnel
      - --no-autoupdate
      - run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped

volumes:
  postgres_data:
```

Điểm quan trọng:

```yaml
expose:
  - "4101"
```

Không cần publish API ra Internet:

```yaml
ports:
  - "4101:4101"
```

vì traffic đến API thông qua:

```text
cloudflared → api:4101
```

---

## 9. Đảm bảo NestJS listen đúng interface

NestJS không nên chỉ bind vào:

```text
127.0.0.1
```

Nên listen trên:

```ts
await app.listen(4101, "0.0.0.0");
```

hoặc cấu hình tương đương.

Nếu API chỉ listen trên `127.0.0.1`, container `cloudflared` sẽ không truy cập được API.

---

## 10. Khởi động hệ thống

Chạy:

```bash
docker compose up -d --build
```

Kiểm tra:

```bash
docker compose ps
```

Mong muốn:

```text
api           healthy
postgres      healthy
cloudflared   running
```

Xem log Tunnel:

```bash
docker compose logs -f cloudflared
```

Trên Cloudflare Dashboard, Tunnel:

```text
classora-production
```

nên ở trạng thái:

```text
Healthy
```

---

## 11. Publish backend ra Internet

Trong Tunnel:

```text
classora-production
→ Add Published Application
```

Cấu hình:

```text
Hostname

Subdomain:
api

Domain:
classora.io.vn

Path:
để trống
```

Full hostname:

```text
api.classora.io.vn
```

Service:

```text
Type:
HTTP

URL:
http://api:4101
```

Không dùng:

```text
http://localhost:4101
```

vì `localhost` bên trong container `cloudflared` chính là container `cloudflared`, không phải API.

---

## 12. Luồng request backend

Sau khi publish:

```text
https://api.classora.io.vn
            │
            ▼
       Cloudflare
            │
            ▼
 classora-production
            │
            ▼
       cloudflared
            │
            ▼
     http://api:4101
            │
            ▼
         NestJS
```

---

## 13. Test health check

NestJS nên có endpoint:

```http
GET /health
```

Ví dụ response:

```json
{
  "status": "ok"
}
```

Test:

```bash
curl https://api.classora.io.vn/health
```

Nếu thành công, toàn bộ đường đi đã hoạt động:

```text
Browser
   ↓
HTTPS
   ↓
Cloudflare
   ↓
api.classora.io.vn
   ↓
Cloudflare Tunnel
   ↓
cloudflared
   ↓
api:4101
   ↓
NestJS
```

---

## 14. Tại sao không public port 4101?

Không cần expose API trực tiếp kiểu:

```text
0.0.0.0:4101
```

Cloudflare Tunnel tạo kết nối outbound:

```text
VPS → Cloudflare
```

Do đó Internet không cần truy cập trực tiếp:

```text
4101
5432
```

Đặc biệt PostgreSQL:

```text
5432
```

không nên public ra Internet.

---

## 15. PostgreSQL

PostgreSQL chạy trong Docker:

```text
postgres:5432
```

API truy cập PostgreSQL qua Docker network nội bộ.

Ví dụ:

```text
api
 ↓
postgres:5432
```

Không cần DNS public hoặc Tunnel cho PostgreSQL.

---

## 16. Tenant sau này

Ví dụ trung tâm Thầy Hạnh:

```text
thayhanh.classora.io.vn
```

Không deploy một React app riêng.

Vẫn dùng cùng frontend:

```text
classora-web
```

React có thể lấy tenant slug từ hostname:

```js
const hostname = window.location.hostname;

// thayhanh.classora.io.vn

const tenantSlug = hostname.split(".")[0];

// thayhanh
```

Frontend vẫn gọi API chung:

```text
https://api.classora.io.vn
```

Backend resolve:

```text
thayhanh
   ↓
tenant
   ↓
tenant ID
   ↓
database tương ứng
```

Không nên dùng slug làm primary key thật của tenant.

Ví dụ:

```text
Tenant
-------------------------------
id       01J...
name     Trung tâm Thầy Hạnh
slug     thayhanh
domain   thayhanh.classora.io.vn
db_name  classora_tenant_01J...
```

Nhờ vậy nếu trung tâm đổi thương hiệu:

```text
thayhanh.classora.io.vn
```

thành:

```text
hanhacademy.classora.io.vn
```

thì chỉ cần đổi slug/domain, tenant ID và dữ liệu không bị ảnh hưởng.

---

## 17. Quy tắc cần nhớ

### DNS

```text
Domain → Cloudflare
```

### Frontend

```text
app.classora.io.vn
        ↓
Cloudflare Workers / Static Assets
        ↓
React/Vite
```

### Backend

```text
api.classora.io.vn
        ↓
Cloudflare Tunnel
        ↓
cloudflared
        ↓
api:4101
        ↓
NestJS
        ↓
PostgreSQL
```

---

## 18. Kiến trúc bảo mật cơ bản

```text
Public Internet
      │
      ├── app.classora.io.vn
      │       ↓
      │   Cloudflare frontend
      │
      └── api.classora.io.vn
              ↓
         Cloudflare Tunnel
              ↓
       private Docker network
              │
       ┌──────┴──────┐
       ▼             ▼
    api:4101     postgres:5432
```

Nguyên tắc:

```text
Không public trực tiếp API ra Internet.
Không public PostgreSQL ra Internet.
Không commit secret/token vào GitHub.
```

---

## 19. Checklist setup Cloudflare

### Domain

- [ ] `classora.io.vn` đang dùng nameserver Cloudflare
- [ ] DNS zone ở trạng thái Active

### Frontend

- [ ] Kết nối GitHub repo `hoatepdev/classora`
- [ ] Root directory là `apps/web`
- [ ] Build command là `npm run build`
- [ ] Production branch là `main`
- [ ] Gắn `app.classora.io.vn`

### Tunnel

- [ ] Tạo Tunnel `classora-production`
- [ ] Lấy đúng Tunnel Token
- [ ] Thêm token vào `.env`
- [ ] Chạy `cloudflared` bằng Docker
- [ ] Tunnel ở trạng thái Healthy

### Backend

- [ ] API chạy port `4101`
- [ ] NestJS listen trên `0.0.0.0`
- [ ] `cloudflared` truy cập được `http://api:4101`
- [ ] Publish `api.classora.io.vn`
- [ ] Test `/health` thành công

### Security

- [ ] Không mở public port `4101`
- [ ] Không mở public port `5432`
- [ ] `.env` nằm trong `.gitignore`
- [ ] Tunnel Token không xuất hiện trong repo

---

## 20. Các lệnh kiểm tra thường dùng

Kiểm tra container:

```bash
docker compose ps
```

Xem log API:

```bash
docker compose logs -f api
```

Xem log Tunnel:

```bash
docker compose logs -f cloudflared
```

Test API public:

```bash
curl https://api.classora.io.vn/health
```

Test API từ container cloudflared:

```bash
docker compose exec cloudflared wget -qO- http://api:4101/health
```

Nếu image `cloudflared` không có `wget`, có thể test bằng một container tạm trong cùng network.

---

## 21. Vị trí lưu tài liệu

Khuyến nghị lưu file này tại:

```text
docs/infrastructure/cloudflare-setup.md
```

Cấu trúc:

```text
classora/
├── apps/
├── infrastructure/
├── docs/
│   └── infrastructure/
│       └── cloudflare-setup.md
└── .github/
```

Không lưu token, password hoặc secret thật trong tài liệu này.
