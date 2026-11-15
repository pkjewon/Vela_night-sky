uniform float uBright;

varying vec2 vTrail;

void main() {
  // 머리 쪽이 밝고 꼬리로 갈수록 가늘고 흐려진다
  float along = pow(vTrail.x, 2.2);
  float across = exp(-vTrail.y * vTrail.y * (4.0 + 10.0 * (1.0 - vTrail.x)));
  float head = exp(-pow((1.0 - vTrail.x) * 14.0, 2.0)) * exp(-vTrail.y * vTrail.y * 2.0);
  float a = (along * across * 0.8 + head) * uBright;
  gl_FragColor = vec4(vec3(0.9, 0.95, 1.0) * a, a);
}
