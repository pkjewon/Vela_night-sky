// 별: 점 하나가 별 하나. 그리기 호출 한 번으로 전부 그린다.
uniform mat3 uRot;          // 적도좌표 → 월드(지평) 회전. 행성용 재질에서는 단위행렬
uniform float uPixelRatio;  // 기기 해상도 배율 (크기를 기기와 무관하게)
uniform float uZoom;        // 확대하면 별도 조금 커지게
uniform float uLimitMag;    // 이 등급보다 어두운 별은 안 보임 (하늘이 밝을수록 작아짐)
uniform float uTime;
uniform float uTwinkle;     // 반짝임 세기 0~1
uniform float uAtmosphere;  // 지평선 근처 어두워짐·붉어짐 0~1
uniform float uRefract;     // 대기 굴절 0 또는 1

attribute float aMag;
attribute float aBv;
attribute float aSeed;

varying vec3 vColor;
varying float vAlpha;
varying float vHalo;

// 색지수(B-V) → 별 색. 작으면 푸른빛, 크면 붉은빛
vec3 bvColor(float bv) {
  float t = clamp((bv + 0.3) / 2.0, 0.0, 1.0);
  vec3 blue = vec3(0.64, 0.76, 1.0);
  vec3 white = vec3(1.0, 0.98, 0.96);
  vec3 yellow = vec3(1.0, 0.89, 0.70);
  vec3 red = vec3(1.0, 0.68, 0.45);
  vec3 c = mix(blue, white, smoothstep(0.0, 0.33, t));
  c = mix(c, yellow, smoothstep(0.33, 0.62, t));
  c = mix(c, red, smoothstep(0.62, 1.0, t));
  return c;
}

void main() {
  vec3 d = uRot * position;
  float sinAlt = d.y;
  d = refractDir(d, uRefract);
  gl_Position = projectionMatrix * viewMatrix * vec4(d, 1.0);

  // 지평선 근처: 빛이 대기를 더 두껍게 통과해서 어둡고 붉어진다
  float airmass = 1.0 / (max(sinAlt, 0.0) + 0.05);          // 천정 약 1, 지평선 약 20
  float extMag = uAtmosphere * 0.16 * min(airmass - 1.0, 12.0);
  float mag = aMag + extMag;

  float visible = smoothstep(uLimitMag + 0.5, uLimitMag - 0.7, mag);
  visible *= smoothstep(-0.012, 0.0, sinAlt);

  float flux = min(pow(10.0, -0.4 * (mag - 1.0)), 40.0);    // 1등급 = 1, 금성처럼 아주 밝은 것은 한도를 둠
  float size = 3.0 + 6.6 * pow(flux, 0.33);                 // 점의 지름(픽셀)
  float alpha = clamp(0.32 + 0.68 * pow(flux, 0.4), 0.0, 1.0);

  // 반짝임: 별마다 다른 리듬, 지평선 가까울수록 강하게
  float low = exp(-max(sinAlt, 0.0) * 5.0);
  float amp = uTwinkle * mix(0.07, 0.42, low);
  float ph = aSeed * 6.2831853;
  float tw = sin(uTime * (2.1 + aSeed * 2.7) + ph) * 0.6 + sin(uTime * (5.3 + aSeed * 3.1) + ph * 1.7) * 0.4;
  alpha *= 1.0 + amp * tw;
  size *= 1.0 + amp * 0.25 * tw;

  vec3 color = mix(vec3(1.0), bvColor(aBv), 0.85);
  color = mix(color, vec3(1.0, 0.62, 0.38), clamp(extMag * 0.55, 0.0, 0.75));

  // 2등급보다 밝은 별에만 작은 빛무리 (후처리 없이 점 안에서 해결)
  vHalo = smoothstep(2.0, -0.5, mag);
  vColor = color;
  vAlpha = alpha * visible;
  gl_PointSize = size * (1.0 + 2.0 * vHalo) * uPixelRatio * uZoom;
  if (vAlpha < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
