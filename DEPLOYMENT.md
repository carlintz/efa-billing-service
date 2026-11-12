# 배포 및 DB 운영

GitHub `carlintz/efa-billing-service`의 main 변경을 전용 Vercel 프로젝트 `efa-billing-service`에 자동 배포합니다. Node.js 22, `npm ci`, `npm run build`, Build Output API `.vercel/output`을 사용합니다. 기존 서비스의 환경변수나 프로젝트 연결을 복사하지 않습니다.

## Supabase

전용 프로젝트의 Database, Auth, 비공개 Storage를 사용합니다. Vercel 환경변수는 `EFA_SUPABASE_URL`, `EFA_SUPABASE_ANON_KEY`(publishable key) 두 개입니다. 서비스 관리자 키는 Vercel이나 브라우저에 넣지 않습니다.

스키마 변경은 `supabase migration new <name>`으로 새 마이그레이션을 생성하고 검토 후 전용 프로젝트에 적용합니다. `supabase/migrations`에 적용 이력이 있습니다. 모든 정산·회원 테이블과 원본 스토리지에는 RLS가 적용됩니다. 최초 관리자 이메일은 운영 DB의 private 허용 목록에만 등록하며 공개 소스에 넣지 않습니다.

Auth Site URL은 `https://efa-billing-service.vercel.app`, Redirect URLs는 `https://efa-billing-service.vercel.app/**`입니다. 다른 도메인을 추가하면 Auth 설정도 갱신합니다. 기본 메일 발송 제한에 영향을 받는 담당자는 관리자가 앱에서 이메일·초기 비밀번호로 계정을 발급합니다.

`npm run build`는 `build/edge/index.js`도 생성합니다. 이 번들을 Supabase Edge Function `efa-billing`으로 배포합니다. 함수는 자체적으로 `auth.getUser(token)`과 활성 회원 권한을 확인하므로 플랫폼 `verify_jwt`는 false로 설정합니다. 이 설정만으로 요청을 신뢰하지 않습니다. Supabase 기본 비밀 환경변수는 Edge Function 내부에서만 사용합니다.

## 저장과 보존

저장 버튼을 누른 경우에만 원본 CSV가 비공개 `efa-billing-raw` 버킷에 업로드됩니다. 서버가 원본을 다시 집계하고 최신 정산과 변경 이력을 한 트랜잭션으로 저장합니다. 버전 충돌 시 409로 덮어쓰기를 거절합니다. 원본은 수정·삭제 권한을 부여하지 않아 과거 버전에 연결된 파일을 보존합니다. 저장 직전 중단된 업로드는 사용되지 않는 원본으로 남을 수 있습니다.

## 검증

```sh
npm ci
npm test
npm run build
npm start
```

로컬 DB 기능은 `.env.example`의 두 값을 실행 환경에 설정합니다. `.env`를 자동으로 읽지 않습니다. 원본 CSV 통합 검사는 `EFA_BILLING_FIXTURE`에 로컬 파일 경로를 설정합니다. 브라우저 검사는 로컬 서버에서 `node test/persistence-browser.mjs`로 모의 인증·저장·이력·복원 흐름을 검사합니다. 운영 배포 후 `/api/config`, 비로그인 정산 API의 401, 환율 조회, 실제 담당자 로그인과 월별 저장을 확인합니다.
