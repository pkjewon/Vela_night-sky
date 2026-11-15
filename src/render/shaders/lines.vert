// 별자리 선: 선분 하나를 화면에서 일정한 두께(픽셀)의 띠로 그린다.
uniform mat3 uRot;
uniform vec2 uResolution;   // 그리기 버퍼 크기(기기 픽셀)
uniform float uWidth;       // 선 두께(기기 픽셀)
uniform float uGap;         // 별에 닿지 않게 끝을 비우는 길이(기기 픽셀)
uniform float uRefract;

attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec4 aParams;     // x: 0=시작점/1=끝점, y: -1/+1 (띠의 어느 쪽), z,w: 시작·끝에 틈을 둘지

varying float vEdge;
varying float vFade;

void main() {
  vec3 a = refractDir(uRot * aStart, uRefract);
  vec3 b = refractDir(uRot * aEnd, uRefract);
  vec4 ca = projectionMatrix * viewMatrix * vec4(a, 1.0);
  vec4 cb = projectionMatrix * viewMatrix * vec4(b, 1.0);
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vEdge = 0.0;
  vFade = 0.0;
  // 한쪽 끝이라도 카메라 뒤에 있으면 그리지 않는다 (선분은 미리 짧게 나눠 두었다)
  if (ca.w <= 0.01 || cb.w <= 0.01) return;

  vec2 halfRes = uResolution * 0.5;
  vec2 sa = ca.xy / ca.w * halfRes;
  vec2 sb = cb.xy / cb.w * halfRes;
  vec2 delta = sb - sa;
  float len = length(delta);
  float gapA = aParams.z * uGap;
  float gapB = aParams.w * uGap;
  if (len < gapA + gapB + 1.0) return;

  vec2 dir = delta / len;
  vec2 normal = vec2(-dir.y, dir.x);
  vec2 pa = sa + dir * gapA;
  vec2 pb = sb - dir * gapB;
  float halfWidth = uWidth * 0.5 + 1.0;
  vec2 p = mix(pa, pb, aParams.x) + normal * aParams.y * halfWidth;

  vEdge = aParams.y * halfWidth;
  vFade = smoothstep(-0.01, 0.03, mix(a.y, b.y, aParams.x));
  gl_Position = vec4(p / halfRes, 0.0, 1.0);
}
