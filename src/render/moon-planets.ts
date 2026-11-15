// 달(위상 포함)과 행성. 위치는 CPU에서 계산한 방위각·고도를 그대로 쓴다.
import * as THREE from 'three';
import { azAltToVec, DEG, refractionDeg, type Vec3 } from '../astro/coords';
import { brightLimbAngle, PLANET_IDS, tangentBasis, type BodyId, type BodyState, type MoonPhase } from '../astro/solar-system';
import { ORDER, withCommon } from './scene';
import { makeStarMaterial, zoomScale } from './stars';
import moonVert from './shaders/moon.vert?raw';
import moonFrag from './shaders/moon.frag?raw';

const MOON_RADIUS_KM = 1737.4;
const KM_PER_AU = 149_597_870.7;
/** 달 사각형의 반쪽 크기(달 반지름의 몇 배까지 달무리를 그릴지) */
const QUAD_EXTENT = 14;

/** 행성 색을 별 셰이더의 색지수(B-V)로 흉내 낸 값 */
const PLANET_BV: Partial<Record<BodyId, number>> = {
  mercury: 0.9,
  venus: 0.7,
  mars: 1.45,
  jupiter: 0.8,
  saturn: 1.0,
};

/** 화면에 그릴 때 쓰는 방향: 굴절만큼 올린 월드 벡터 */
export function apparentDir(body: { az: number; alt: number }): Vec3 {
  return azAltToVec(body.az, body.alt + refractionDeg(body.alt));
}

export class MoonAndPlanets {
  readonly moon: THREE.Mesh;
  readonly planets: THREE.Points;
  private readonly moonMaterial: THREE.ShaderMaterial;
  private readonly planetMaterial = makeStarMaterial();
  private readonly planetPositions = new Float32Array(PLANET_IDS.length * 3);
  private readonly planetMags = new Float32Array(PLANET_IDS.length);

  constructor() {
    this.moonMaterial = new THREE.ShaderMaterial({
      vertexShader: moonVert,
      fragmentShader: withCommon(moonFrag),
      uniforms: {
        uCenter: { value: new THREE.Vector3(0, 1, 0) },
        uRight: { value: new THREE.Vector3(1, 0, 0) },
        uUp: { value: new THREE.Vector3(0, 0, -1) },
        uRadius: { value: Math.tan(0.26 * DEG) },
        uSunDir2: { value: new THREE.Vector2(0, 1) },
        uPhase: { value: 0 },
        uBright: { value: 1 },
        uGlow: { value: 1 },
        uNight: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(QUAD_EXTENT * 2, QUAD_EXTENT * 2), this.moonMaterial);
    this.moon.frustumCulled = false;
    this.moon.renderOrder = ORDER.moon;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.planetPositions, 3));
    geometry.setAttribute('aMag', new THREE.BufferAttribute(this.planetMags, 1));
    geometry.setAttribute(
      'aBv',
      new THREE.BufferAttribute(new Float32Array(PLANET_IDS.map((id) => PLANET_BV[id] ?? 0.7)), 1),
    );
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(PLANET_IDS.map((_, i) => i / 5)), 1));
    // 행성 위치는 이미 지평좌표라서 회전은 단위행렬(기본값) 그대로
    this.planetMaterial.uniforms.uRot.value.identity();
    this.planets = new THREE.Points(geometry, this.planetMaterial);
    this.planets.frustumCulled = false;
    this.planets.renderOrder = ORDER.planets;
  }

  /** 천체 위치가 바뀔 때(몇 초에 한 번) 부른다. */
  setBodies(bodies: BodyState[], phase: MoonPhase, night: number): void {
    const byId = new Map(bodies.map((b) => [b.id, b]));
    const moon = byId.get('moon')!;
    const sun = byId.get('sun')!;

    const center = apparentDir(moon);
    const { up, right } = tangentBasis(center);
    const u = this.moonMaterial.uniforms;
    u.uCenter.value.set(...center);
    u.uRight.value.set(...right);
    u.uUp.value.set(...up);
    u.uRadius.value = Math.tan(Math.asin(MOON_RADIUS_KM / (moon.distAU * KM_PER_AU)));
    // 밝은 쪽이 해를 향하도록: 천정 쪽을 0°로 시계 방향으로 잰 각도 → (오른쪽, 위) 성분
    const limb = brightLimbAngle(moon, sun) * DEG;
    u.uSunDir2.value.set(Math.sin(limb), Math.cos(limb));
    u.uPhase.value = phase.phaseAngle * DEG;
    u.uBright.value = 0.55 + 0.45 * night; // 낮달은 옅게
    u.uGlow.value = phase.fraction * night;
    u.uNight.value = night;
    this.moon.visible = moon.alt > -1.5;

    PLANET_IDS.forEach((id, i) => {
      const p = byId.get(id)!;
      // 굴절은 별과 같은 셰이더가 처리하므로 여기서는 굴절 전 방향을 넣는다
      const v = azAltToVec(p.az, p.alt);
      this.planetPositions.set(v, i * 3);
      this.planetMags[i] = p.mag;
    });
    this.planets.geometry.attributes.position.needsUpdate = true;
    this.planets.geometry.attributes.aMag.needsUpdate = true;
  }

  update(opts: { limitMag: number; time: number; twinkle: number; pixelRatio: number; fov: number }): void {
    const u = this.planetMaterial.uniforms;
    // 행성은 별보다 훨씬 덜 반짝인다
    u.uLimitMag.value = opts.limitMag;
    u.uTime.value = opts.time;
    u.uTwinkle.value = opts.twinkle * 0.25;
    u.uPixelRatio.value = opts.pixelRatio;
    u.uZoom.value = zoomScale(opts.fov) * 1.15;
  }
}
