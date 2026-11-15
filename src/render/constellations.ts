// 별자리 선: 별보다 눈에 덜 띄는 얇고 은은한 선.
// 선분마다 사각형(꼭짓점 4개)을 만들고, 셰이더가 화면에서 일정한 두께로 펼친다.
import * as THREE from 'three';
import { angularSeparation, type Mat3, type Vec3 } from '../astro/coords';
import { starVec, type StarCatalog } from '../astro/stars';
import { ORDER, setMat3, withCommon } from './scene';
import linesVert from './shaders/lines.vert?raw';
import linesFrag from './shaders/lines.frag?raw';

export interface ConstellationData {
  id: string;
  /** 1(잘 알려진 별자리)~3 */
  rank: number;
  /** 선마다 이어지는 별 번호 목록 */
  lines: number[][];
  /** 이름표 방향(J2000 적도좌표 단위벡터) */
  label: Vec3;
}

export interface ConstellationFile {
  constellations: ConstellationData[];
}

/** 이보다 긴 선분은 나눈다(도). 한쪽 끝이 카메라 뒤로 가는 긴 선분이 통째로 사라지지 않게. */
const MAX_SEGMENT_DEG = 6;

function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const omega = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  if (omega < 1e-6) return a;
  const s = Math.sin(omega);
  const ka = Math.sin((1 - t) * omega) / s;
  const kb = Math.sin(t * omega) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}

export class ConstellationLines {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(data: ConstellationData[], catalog: StarCatalog) {
    const starts: number[] = [];
    const ends: number[] = [];
    const params: number[] = [];
    const indices: number[] = [];
    let quad = 0;
    const addSegment = (a: Vec3, b: Vec3, gapA: number, gapB: number) => {
      for (const [sel, side] of [
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 1],
      ]) {
        starts.push(a[0], a[1], a[2]);
        ends.push(b[0], b[1], b[2]);
        params.push(sel, side, gapA, gapB);
      }
      const o = quad * 4;
      indices.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
      quad++;
    };

    for (const c of data) {
      for (const line of c.lines) {
        for (let i = 0; i < line.length - 1; i++) {
          const a = starVec(catalog, line[i]);
          const b = starVec(catalog, line[i + 1]);
          const parts = Math.max(1, Math.ceil(angularSeparation(a, b) / MAX_SEGMENT_DEG));
          for (let k = 0; k < parts; k++) {
            addSegment(slerp(a, b, k / parts), slerp(a, b, (k + 1) / parts), k === 0 ? 1 : 0, k === parts - 1 ? 1 : 0);
          }
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    // position은 쓰지 않지만 Three.js가 꼭짓점 개수를 알 수 있게 넣는다
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(starts, 3));
    geometry.setAttribute('aStart', new THREE.Float32BufferAttribute(starts, 3));
    geometry.setAttribute('aEnd', new THREE.Float32BufferAttribute(ends, 3));
    geometry.setAttribute('aParams', new THREE.Float32BufferAttribute(params, 4));
    geometry.setIndex(indices);

    this.material = new THREE.ShaderMaterial({
      vertexShader: withCommon(linesVert),
      fragmentShader: linesFrag,
      uniforms: {
        uRot: { value: new THREE.Matrix3() },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uWidth: { value: 1 },
        uGap: { value: 6 },
        uRefract: { value: 1 },
        uColor: { value: new THREE.Vector3(0.52, 0.64, 0.9) },
        uOpacity: { value: 0.3 },
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
    this.mesh.renderOrder = ORDER.lines;
  }

  setRotation(m: Mat3): void {
    setMat3(this.material.uniforms.uRot.value, m);
  }

  /**
   * @param night 밤인 정도 0~1 (낮에는 선이 안 보임)
   * @param bufferSize 그리기 버퍼 크기(기기 픽셀)
   */
  update(opts: { visible: boolean; night: number; bufferSize: [number, number]; pixelRatio: number }): void {
    this.mesh.visible = opts.visible && opts.night > 0.02;
    const u = this.material.uniforms;
    u.uResolution.value.set(opts.bufferSize[0], opts.bufferSize[1]);
    u.uWidth.value = 1.1 * opts.pixelRatio;
    u.uGap.value = 7 * opts.pixelRatio;
    u.uOpacity.value = 0.2 * opts.night;
  }
}
