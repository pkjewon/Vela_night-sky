// 별똥별: 꼬리 모양의 얇은 사각형. 꼭짓점은 CPU에서 매 프레임 놓는다.
attribute vec2 aTrail;   // x: 0=꼬리 끝 ~ 1=머리, y: -1/+1 (폭 방향)

varying vec2 vTrail;

void main() {
  vTrail = aTrail;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
