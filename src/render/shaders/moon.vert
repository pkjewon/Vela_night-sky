// 달: 달 방향에 세운 작은 사각형. 가운데 반지름 1이 달 원반, 그 바깥은 달무리.
uniform vec3 uCenter;   // 달 방향(월드, 굴절 반영)
uniform vec3 uRight;    // 달을 바라볼 때 화면 오른쪽
uniform vec3 uUp;       // 달을 바라볼 때 천정 쪽
uniform float uRadius;  // 달의 겉보기 반지름(라디안의 tan)

varying vec2 vP;

void main() {
  vP = position.xy;
  vec3 d = normalize(uCenter + (uRight * position.x + uUp * position.y) * uRadius);
  gl_Position = projectionMatrix * viewMatrix * vec4(d, 1.0);
}
