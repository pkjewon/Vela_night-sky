// 여러 셰이더가 같이 쓰는 함수. (src/astro/coords.ts의 refractionDeg와 같은 식)
const float PI = 3.141592653589793;

// 대기 굴절: 지평선 근처 천체가 실제보다 높게 보이는 정도(도)
float refractionDeg(float altDeg) {
  float hd = max(altDeg, -1.0);
  float r = 1.02 / tan(radians(hd + 10.3 / (hd + 5.11))) / 60.0;
  if (altDeg < -1.0) r *= (altDeg + 90.0) / 89.0;
  return r;
}

// 월드 방향 d(+Y=천정)를 굴절만큼 들어 올린다. amount=0이면 그대로.
vec3 refractDir(vec3 d, float amount) {
  float h = length(d.xz);
  if (h < 1e-6) return d;
  float alt = asin(clamp(d.y, -1.0, 1.0));
  float a2 = alt + radians(refractionDeg(degrees(alt))) * amount;
  return vec3(d.x / h * cos(a2), sin(a2), d.z / h * cos(a2));
}

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}
