varying vec3 vColor;
varying float vAlpha;
varying float vHalo;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  // 빛무리가 있으면 점을 (1+2*vHalo)배로 키웠으므로, 가운데 밝은 부분은 그만큼 좁게
  float rc = r * (1.0 + 2.0 * vHalo);
  float core = exp(-rc * rc * 4.0);
  float halo = vHalo * 0.13 * pow(1.0 - r, 2.6);
  float a = (core + halo) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}
