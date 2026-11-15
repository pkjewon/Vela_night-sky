// 오로라 꿈 모드: 북쪽 낮은 하늘에 세운 띠 모양 곡면.
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
