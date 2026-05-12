# 비금통통 🚢
비금도 배편 시간표 웹앱

---

## 배포 순서

### 1단계 — API 키 신청 (1~3일 소요)
1. [data.go.kr](https://www.data.go.kr) 회원가입
2. 검색창에 **"한국해양교통안전공단 운항 스케줄 정보"** 검색
3. 활용신청 버튼 클릭 → 승인 대기
4. 승인 후 **서비스키(Encoding)** 복사해두기

---

### 2단계 — GitHub 업로드
```bash
git init
git add .
git commit -m "비금통통 초기 배포"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/bigeumtongtong.git
git push -u origin main
```

---

### 3단계 — Netlify 연결
1. [netlify.com](https://netlify.com) 로그인
2. **Add new site → Import an existing project → GitHub**
3. `bigeumtongtong` 저장소 선택
4. Build settings (자동 감지됨):
   - Build command: `npm run build`
   - Publish directory: `dist`
5. **Deploy site** 클릭

---

### 4단계 — 환경변수 설정 (중요!)
1. Netlify 대시보드 → 해당 사이트 클릭
2. **Site configuration → Environment variables**
3. **Add a variable** 클릭:
   - Key: `KOMSA_API_KEY`
   - Value: 1단계에서 받은 서비스키 붙여넣기
4. **Save** → **Trigger deploy** (재배포)

---

## 프로젝트 구조
```
bigeumtongtong/
├── netlify/
│   └── functions/
│       └── ferry.js        ← API 프록시 (CORS 우회)
├── src/
│   ├── main.jsx
│   └── App.jsx             ← 메인 앱
├── index.html
├── package.json
├── vite.config.js
├── netlify.toml
└── .env.example
```

---

## 로컬 개발 (선택사항)
```bash
# 패키지 설치
npm install

# .env 파일 생성
cp .env.example .env
# .env 파일에 KOMSA_API_KEY=발급받은키 입력

# Netlify CLI 설치 (로컬에서 Functions 테스트)
npm install -g netlify-cli
netlify dev
```

---

## API 정보
- 제공처: 한국해양교통안전공단 (KOMSA)
- 데이터: 연안여객선 운항 스케줄 정보
- 포털: https://www.data.go.kr/data/15142302/openapi.do
- 무료 · 승인 후 사용 가능

---

## 추후 개선 가능한 것들
- [ ] 기상청 API 연동 (실제 파고/풍속)
- [ ] PWA 설정 (홈 화면 추가)
- [ ] 결항 알림 푸시 (Netlify Scheduled Functions)
- [ ] 카카오 공유 버튼
