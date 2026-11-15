// 오로라 커튼(상상 모드): 세로 광선이 모인 커튼. 아래는 초록, 위로 갈수록 붉은·보랏빛.
// vUv.x = 방위(0=북서쪽 끝, 1=북동쪽 끝), vUv.y = 고도(0=약 3°, 1=약 48°)
uniform float uTime;
uniform float uOpacity;
uniform float uSeed;
uniform float uDetail;   // 1=보통, 0=간단히(느린 폰)

varying vec2 vUv;

float curtain(vec2 uv, float offset, float speed) {
  float t = uTime * speed + uSeed * 13.7 + offset;
  // 커튼이 좌우로 천천히 굽이친다
  float bend = fbm(vec2(uv.x * 2.2 + offset, t * 0.35)) - 0.5;
  float x = uv.x + bend * 0.22;
  // 커튼 아래 가장자리 높이 (방위에 따라 오르내림)
  float base = 0.16 + 0.26 * fbm(vec2(x * 2.6 + offset * 3.0, t * 0.22 + 4.0));
  float h = uv.y - base;
  // 아래는 또렷하게 시작해서 위로 길게 사라진다
  float profile = smoothstep(0.0, 0.035, h) * exp(-max(h, 0.0) * 4.2);
  // 세로 광선
  float rays = vnoise(vec2(x * 46.0 + offset * 9.0, t * 0.9));
  if (uDetail > 0.5) rays = 0.6 * rays + 0.4 * vnoise(vec2(x * 110.0, t * 1.3 + 7.0));
  float band = 0.35 + 0.65 * fbm(vec2(x * 5.0 + offset, t * 0.5 + 2.0));
  return profile * (0.35 + 0.65 * rays) * band;
}

void main() {
  // 양 끝과 위·아래는 자연스럽게 사라지게
  float edge = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
  edge *= smoothstep(0.0, 0.05, vUv.y) * smoothstep(1.0, 0.7, vUv.y);

  float c1 = curtain(vUv, 0.0, 0.11);
  float c2 = curtain(vUv * vec2(1.0, 1.15) + vec2(0.0, -0.06), 2.7, 0.08) * 0.6;
  float i = (c1 + c2) * edge;

  // 색: 높이에 따라 초록 → 청록 → 보라·붉은빛
  float hgt = clamp((vUv.y - 0.18) * 1.7, 0.0, 1.0);
  vec3 green = vec3(0.25, 1.0, 0.5);
  vec3 teal = vec3(0.2, 0.75, 0.75);
  vec3 purple = vec3(0.62, 0.3, 0.85);
  vec3 col = mix(green, teal, smoothstep(0.15, 0.5, hgt));
  col = mix(col, purple, smoothstep(0.4, 0.95, hgt));

  float a = i * uOpacity;
  gl_FragColor = vec4(col * a, a);
}
