// 하늘 공(안쪽에서 보는 큰 공). 꼭짓점 위치가 곧 바라보는 방향.
varying vec3 vDir;

void main() {
  vDir = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
