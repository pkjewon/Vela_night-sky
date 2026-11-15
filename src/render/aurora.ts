// 오로라 꿈 모드(상상 모드): 북쪽 낮은 하늘의 커튼. 실제 예보가 아니라 연출이다.
import * as THREE from 'three';
import { azAltToVec } from '../astro/coords';
import { ORDER, withCommon } from './scene';
import auroraVert from './shaders/aurora.vert?raw';
import auroraFrag from './shaders/aurora.frag?raw';

/** 북쪽을 가운데로 좌우 몇 도까지 */
export const AURORA_HALF_WIDTH = 85;
export const AURORA_ALT_MIN = 3;
export const AURORA_ALT_MAX = 48;

export class Aurora {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  /** 켜고 끌 때 부드럽게 나타나고 사라지는 정도 0~1 */
  private level = 0;

  constructor(seed: number) {
    const cols = 64;
    const rows = 12;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const u = c / cols;
        const v = r / rows;
        const az = -AURORA_HALF_WIDTH + u * AURORA_HALF_WIDTH * 2;
        const alt = AURORA_ALT_MIN + v * (AURORA_ALT_MAX - AURORA_ALT_MIN);
        positions.push(...azAltToVec(az, alt));
        uvs.push(u, v);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c;
        const b = a + 1;
        const d = a + cols + 1;
        indices.push(a, b, d, b, d + 1, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    this.material = new THREE.ShaderMaterial({
      vertexShader: auroraVert,
      fragmentShader: withCommon(auroraFrag),
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uSeed: { value: (seed % 1000) / 1000 },
        uDetail: { value: 1 },
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
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = ORDER.aurora;
    this.mesh.visible = false;
  }

  /**
   * @param dt 지난 프레임 이후 시간(초). 0이면 바로 켜짐/꺼짐(스크린샷용)
   * @param night 밤인 정도 0~1 (낮에는 오로라도 안 보임)
   */
  update(time: number, dt: number, enabled: boolean, night: number, detail: number): void {
    const target = enabled ? 1 : 0;
    this.level = dt <= 0 ? target : this.level + (target - this.level) * Math.min(1, dt * 1.5);
    const opacity = this.level * night * 0.75;
    this.mesh.visible = opacity > 0.003;
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uOpacity.value = opacity;
    u.uDetail.value = detail;
  }
}
