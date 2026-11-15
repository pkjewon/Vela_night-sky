# 출처와 라이선스

앱 코드는 [MIT](LICENSE)입니다. 앱에 들어 있는 데이터는 원본 라이선스를 따릅니다 — [public/data/LICENSE](public/data/LICENSE), [public/textures/LICENSE](public/textures/LICENSE).
같은 내용이 앱의 ⓘ 화면에도 있습니다.

## 앱에 들어 있는 것

| 이름 | 쓰는 곳 | 라이선스 | 해야 할 일 / 한 일 |
| --- | --- | --- | --- |
| [HYG Database v4.2](https://codeberg.org/astronexus/hyg) (David Nash) | 별 데이터 `public/data/stars.bin`, `star-names.json` | CC BY-SA 4.0 | 출처 표기. 6.5등급까지 골라 고유운동을 2026.5년으로 적용해 가공. 가공본도 CC BY-SA 4.0 |
| [d3-celestial](https://github.com/ofrohn/d3-celestial) © 2015 Olaf Frohn | 별자리 선 `public/data/constellations.json` | BSD-3-Clause | 저작권·라이선스 원문을 `public/data/LICENSE`에 함께 배포 |
| [Gaia's sky in colour](https://sci.esa.int/web/gaia/-/60196-gaia-s-sky-in-colour-equirectangular-projection) | 은하수 그림 `public/textures/milkyway.webp` | CC BY-SA 3.0 IGO | "ESA/Gaia/DPAC, CC BY-SA 3.0 IGO" 표기, **가공함**(좌표 변환·흐리게·축소). 가공본도 같은 라이선스 |
| [Astronomy Engine](https://github.com/cosinekitty/astronomy) (Don Cross) | 해·달·행성 계산 | MIT | 라이선스 문구 유지 (번들에 포함) |
| [Three.js](https://threejs.org) | 3D 화면 | MIT | 라이선스 문구 유지 (번들에 포함) |
| 한글 별자리 이름 | `public/data/names-ko.json` | 사실 정보로 봄(추측) | 한국천문학회 표준 이름을 [위키백과 목록](https://ko.wikipedia.org/wiki/국제천문연맹_지정_별자리)과 대조. 출처를 ⓘ 화면에 남김 |

## 개발·테스트에만 쓰는 것 (앱에 안 들어감)

| 이름 | 쓰는 곳 | 라이선스 |
| --- | --- | --- |
| [Skyfield](https://rhodesmill.org/skyfield/) + JPL DE421 | 정확도 정답지(`tests/fixtures/reference.json`) 만들기 | MIT로 알고 있음(확인 안 함) |
| Vite, Vitest, Playwright, TypeScript, tsx | 빌드·테스트 | MIT / Apache-2.0 |
| sharp | 이미지 가공 스크립트 | Apache-2.0 |
| Stellarium | 사람이 눈으로 비교할 때만 | GPL — 코드·데이터·그림을 가져오지 않음 |
| `tests/fixtures/d3-celestial.constellations.lines.json` | 별자리 선 테스트용 원본 사본 | BSD-3-Clause (`tests/fixtures/d3-celestial.LICENSE`) |

폰트는 따로 받지 않고 기기 기본 글꼴을 씁니다.
