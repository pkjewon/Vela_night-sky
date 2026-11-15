// 하늘색(해 고도에 따라) + 해 + 은하수.
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;          // 해 쪽 지평선의 노을빛
uniform vec3 uSunDir;        // 해 방향(월드, 굴절 반영)
uniform float uSunDisc;      // 해 원반 밝기 (밤엔 0)
uniform mat3 uInvRot;        // 월드 → 적도좌표 (은하수 텍스처용)
uniform sampler2D uMilky;
uniform float uMilkyStrength;

varying vec3 vDir;

void main() {
  vec3 d = normalize(vDir);
  float y = max(d.y, 0.0);

  // 천정 → 지평선 그라데이션. 지평선 위로 부드러운 빛 띠가 남는다
  float t = pow(1.0 - y, 2.6);
  vec3 col = mix(uZenith, uHorizon, t);

  // 해 쪽 지평선이 더 밝게
  float sunCos = dot(d, uSunDir);
  float side = pow(max(sunCos * 0.5 + 0.5, 0.0), 5.0) * pow(1.0 - y, 2.2);
  col += uGlow * side;

  // 해 원반(반지름 약 0.27°)과 주변 빛
  float ang = acos(clamp(sunCos, -1.0, 1.0));
  float disc = smoothstep(0.0058, 0.0042, ang);
  col += uSunDisc * (vec3(1.0, 0.97, 0.9) * disc + vec3(1.0, 0.9, 0.7) * (0.45 * exp(-ang * 16.0) + 0.12 * exp(-ang * 3.5)));

  // 은하수: 적도좌표로 되돌려 텍스처에서 읽는다 (가로=적경, 세로=적위)
  if (uMilkyStrength > 0.001) {
    vec3 e = uInvRot * d;
    float ra = atan(e.y, e.x) / (2.0 * PI);
    float dec = asin(clamp(e.z, -1.0, 1.0)) / PI;
    vec3 mw = texture2D(uMilky, vec2(fract(ra), 0.5 + dec)).rgb;
    // 지평선 근처에서는 대기에 묻혀 흐려진다
    float fade = smoothstep(0.0, 0.3, d.y);
    col += mw * mw * uMilkyStrength * (0.25 + 0.75 * fade);
  }

  // 그라데이션의 줄무늬(밴딩)를 없애는 아주 약한 잡음
  col += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
