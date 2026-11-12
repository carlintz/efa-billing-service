# 독립 배포 구성

- GitHub 저장소 제안: `carlintz/efa-billing-service`
- Vercel 프로젝트 제안: `efa-billing-service` (새 프로젝트)
- 프로덕션 브랜치: `main`
- 프레임워크: Other
- Node.js: 22.x
- 설치: `npm ci`
- 빌드: `npm run build`
- 출력: Vercel Build Output API의 `.vercel/output` (Output Directory 재정의 불필요)
- 필수 환경변수: 없음
- 데이터베이스: 없음

## GitHub와 Vercel 연결

1. 이 프로젝트만 들어 있는 저장소를 생성하고 소스를 push합니다.
2. Vercel에서 Add New → Project로 해당 저장소를 import합니다.
3. 새 프로젝트 이름을 `efa-billing-service`로 지정하고 위 설정으로 배포합니다.
4. Git 연동 이후 main push는 프로덕션, 다른 브랜치/PR은 미리보기 배포로 관리합니다.
5. `/` 화면, `/api/rate?month=2026-10` 응답, CSV 업로드 후 Excel 다운로드를 확인합니다.

계정에 따라 Vercel의 GitHub App에 새 저장소 접근 권한을 추가해야 할 수 있습니다. 기존 다른 프로젝트의 root directory, repository link, 환경변수, 도메인은 변경하지 않습니다. 전용 도메인이 필요하면 이 새 프로젝트에만 연결합니다.

## 기존 Sites 버전과의 관계

이 소스는 Sites의 프로젝트 ID, Cloudflare Worker, 별도 서비스의 Supabase 환경변수를 포함하지 않습니다. Vercel 배포의 정상 동작을 확인하기 전까지 기존 Sites 주소를 유지합니다. 기존 주소의 삭제나 리디렉션은 별도 요청 시 진행합니다.

## 데이터 범위

CSV 처리, 정산 계산, Excel 생성은 브라우저에서 수행합니다. CSV를 전송하거나 서버·DB에 저장하는 경로가 없습니다. 서버의 `/api/rate`는 월 문자열만 받아 서울외국환중개의 공개 월평균 환율 표를 조회합니다. 따라서 Supabase 프로젝트·스토리지·키가 필요하지 않습니다.

## 로컬 배포 출력 검사

```sh
npm ci
npm test
npm run build
npm start
```

Vercel CLI를 사용하는 경우 새 프로젝트를 명시적으로 연결한 뒤 배포합니다. 기존 다른 서비스의 `.vercel/project.json`을 복사하지 마세요.

```sh
npx vercel link
npx vercel deploy --prod
```
