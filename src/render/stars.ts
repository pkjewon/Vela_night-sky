// 별 그리기: THREE.Points 하나 + 직접 쓴 셰이더. 그리기 호출 한 번.
// 별마다 좌표를 다시 계산하지 않고, 전체에 회전 행렬(uRot) 하나만 적용한다.
import * as THREE from 'three';
import type { Mat3 } from '../astro/coords';
import type { StarCatalog } from '../astro/stars';
import { ORDER, setMat3, withCommon } from './scene';
import starsVert from './shaders/stars.vert?raw';
import starsFrag from './shaders/stars.frag?raw';

export function makeStarMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: withCommon(starsVert),
    fragmentShader: starsFrag,
    uniforms: {
      uRot: { value: new THREE.Matrix3() },
      uPixelRatio: { value: 1 },
      uZoom: { value: 1 },
      uLimitMag: { value: 6.5 },
      uTime: { value: 0 },
      uTwinkle: { value: 1 },
      uAtmosphere: { value: 1 },
      uRefract: { value: 1 },
    },
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });
}

/** 별 번호로 정해지는 0~1 값 (반짝임 리듬). 항상 같은 값이라 화면이 재현된다. */
export function starSeed(index: number, seed: number): number {
  const x = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** 확대할수록 별이 조금 커지는 배율. */
export function zoomScale(fov: number): number {
  return Math.pow(70 / fov, 0.35);
}

export class StarField {
  readonly points: THREE.Points;
  readonly material = makeStarMaterial();

  constructor(catalog: StarCatalog, seed: number) {
    const n = catalog.count;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(catalog.positions, 3));
    geometry.setAttribute('aMag', new THREE.BufferAttribute(catalog.mag, 1));
    const bv = new Float32Array(n);
    const seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      bv[i] = Number.isNaN(catalog.bv[i]) ? 0.6 : catalog.bv[i];
      seeds[i] = starSeed(i, seed);
    }
    geometry.setAttribute('aBv', new THREE.BufferAttribute(bv, 1));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = ORDER.stars;
  }

  setRotation(m: Mat3): void {
    setMat3(this.material.uniforms.uRot.value, m);
  }

  update(opts: { limitMag: number; time: number; twinkle: number; pixelRatio: number; fov: number }): void {
    const u = this.material.uniforms;
    u.uLimitMag.value = opts.limitMag;
    u.uTime.value = opts.time;
    u.uTwinkle.value = opts.twinkle;
    u.uPixelRatio.value = opts.pixelRatio;
    u.uZoom.value = zoomScale(opts.fov);
  }
}
