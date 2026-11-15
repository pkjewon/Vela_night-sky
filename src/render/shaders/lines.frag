uniform vec3 uColor;
uniform float uOpacity;
uniform float uWidth;

varying float vEdge;
varying float vFade;

void main() {
  // 띠의 가장자리를 부드럽게
  float a = clamp(uWidth * 0.5 + 0.5 - abs(vEdge), 0.0, 1.0) * uOpacity * vFade;
  if (a <= 0.002) discard;
  gl_FragColor = vec4(uColor * a, a);
}
