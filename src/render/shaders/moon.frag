// 달의 위상: 공 모양 달에 해 방향에서 빛을 비춘다.
uniform vec2 uSunDir2;     // 달에서 해 쪽을 향하는 화면 위 방향 (오른쪽, 위), 길이 1
uniform float uPhase;      // 위상각(라디안): 0=보름, PI=삭
uniform float uBright;     // 전체 밝기 (낮에는 옅게)
uniform float uGlow;       // 달무리 세기 (빛난 비율에 비례)
uniform float uNight;      // 밤일수록 1: 지구 반사광(어두운 쪽이 희미하게 보임)

varying vec2 vP;

void main() {
  float r = length(vP);
  vec3 col = vec3(0.0);
  float aa = fwidth(r) * 1.2 + 1e-4;

  if (r < 1.0 + aa) {
    float z = sqrt(max(1.0 - r * r, 0.0));
    vec3 n = vec3(vP, z);
    // 해 방향: 보름(0)이면 보는 사람 쪽에서, 삭(PI)이면 달 뒤에서 비춘다
    vec3 L = vec3(uSunDir2 * sin(uPhase), cos(uPhase));
    float lit = smoothstep(-0.03, 0.07, dot(n, L));
    // 달의 바다(어두운 무늬)를 아주 약하게
    float maria = fbm(vP * 2.3 + vec2(3.1, 1.7));
    float surface = (0.82 + 0.18 * z) * (1.0 - 0.28 * smoothstep(0.45, 0.7, maria));
    vec3 moonCol = vec3(0.97, 0.95, 0.9) * surface;
    vec3 dark = vec3(0.05, 0.06, 0.08) * uNight;
    col = mix(dark, moonCol * uBright, lit) * smoothstep(1.0 + aa, 1.0 - aa, r);
  }

  // 달무리: 달 주변으로 부드럽게 퍼지는 빛
  float g = uGlow * (0.22 * exp(-max(r - 1.0, 0.0) * 0.55) + 0.05 * exp(-max(r - 1.0, 0.0) * 0.12));
  g *= smoothstep(14.0, 6.0, r);
  col += vec3(0.75, 0.82, 1.0) * g * step(1.0, r) + vec3(0.75, 0.82, 1.0) * g * 0.0;

  gl_FragColor = vec4(col, 1.0);
}
