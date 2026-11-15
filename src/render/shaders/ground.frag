// 지평선 아래 어두운 땅. 다른 것을 다 그린 뒤 맨 위에 덮는다.
uniform vec3 uGround;
uniform vec3 uHorizon;

varying vec3 vDir;

void main() {
  vec3 d = normalize(vDir);
  float a = smoothstep(0.003, -0.01, d.y);
  if (a <= 0.0) discard;
  // 지평선 바로 아래는 하늘빛이 살짝 번지고, 아래로 갈수록 어둡게
  float depth = clamp(-d.y * 4.0, 0.0, 1.0);
  vec3 col = mix(mix(uGround, uHorizon, 0.22), uGround * 0.7, depth);
  col += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(max(col, 0.0), a);
}
