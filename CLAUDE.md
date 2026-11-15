# CLAUDE.md — 진짜 밤하늘 + 오로라

실제 별 데이터(HYG v4.2)로 지금 시간·내 위치의 밤하늘을 보여주는 웹 앱. 친구들이 카톡 링크로 아이폰에서 열고, 폰을 하늘로 들면 그 방향의 별이 보인다. 컴퓨터에서는 마우스 드래그.
배포 주소: https://pkjewon.github.io/night-sky/ (vite base `/night-sky/`)

새 대화를 시작하면 **docs/PROGRESS.md부터 읽고** 시작한다. 전체 계획은 docs/PLAN.md.

## 규칙

- **기술 스택 고정**: Vite, TypeScript(strict), Three.js(직접 쓴 셰이더, 프레임워크 없음), astronomy-engine, Vitest, Playwright. 새 라이브러리나 데이터는 추가 전에 라이선스를 확인해 ATTRIBUTION.md에 기록. **GPL 코드·데이터는 쓰지 않는다** (Stellarium은 눈으로 비교만).
- **작업 순서**: 테스트 먼저 → 구현 → `npm run check` 통과 → 화면이 바뀌었으면 Playwright로 `docs/screenshots/stage-N/`에 스크린샷을 찍고 직접 열어서 확인 → docs/PROGRESS.md 기록 → 커밋.
- **PROGRESS.md 형식**: 단계, 한 일, 테스트 결과(개수·통과 여부), 스크린샷 확인 결과, 남은 문제, "사용자가 아이폰으로 확인할 것" 목록.
- 요청받은 단계 범위를 넘는 기능은 만들지 말고 PROGRESS.md의 **"나중에"** 목록에 적는다.
- `src/astro/`는 화면과 무관한 순수 계산만. three.js나 DOM을 import하지 않는다.
- **좌표 규칙**: 방위각은 북=0°, 동=90°, 남=180°. 고도는 지평선=0°, 천정=90°. Three.js 월드는 +Y=천정, -Z=북, +X=동.
- 시간·장소·시점은 URL 파라미터(`t, lat, lon, az, alt, fov`)로 고정할 수 있어야 하고, 테스트와 스크린샷은 항상 고정값을 쓴다. 무작위 연출은 `seed` 파라미터로 고정한다 (seed가 있으면 움직임이 멈춘 한 장면).
- **성능 예산**: 아이폰에서 60fps 목표, 다운로드 합계 3MB 이하(첫 화면 1MB 이하, `npm run size`로 검사).
- 보고는 한국어로, 그래픽·천문 용어는 쉽게 풀어서. **추측한 것과 확인한 것을 구분**해서 쓴다.

## 자주 쓰는 명령

| 명령 | 하는 일 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm test` | 단위 테스트(Vitest) |
| `npm run e2e` | 빌드 + 화면 테스트(Playwright, 데스크톱 1280x720·모바일 390x844) |
| `npm run check` | 타입 검사 + 단위 테스트 + 빌드 + 크기 검사 + 화면 테스트 (커밋 전 필수) |
| `npm run og` | 카톡 미리보기 사진 다시 만들기 (`npm run preview`가 켜져 있어야 함) |
| `npm run fixtures` | Skyfield로 정확도 정답지 다시 만들기 (`.venv` 필요) |
| `npm run data:stars` 등 | `raw/`의 원본 데이터로 public/data 다시 만들기 |

## URL 파라미터

`t`(예: `2026-12-14T22:00+09:00`), `lat`, `lon`, `az`, `alt`, `fov`(20~100), `aurora=1`, `seed`, `debug=1`(화면 안 디버그 패널) / `debug=table`(천체 위치 표).
`az`·`alt`가 있으면 시작 화면 없이 드래그 모드로 바로 연다.
