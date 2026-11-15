// 별똥별 그리기: 얇은 사각형 하나를 매 프레임 옮겨 놓는다.
import * as THREE from 'three';
import type { Vec3 } from '../astro/coords';
import { MeteorSchedule, meteorShape } from './meteor-math';
import { ORDER } from './scene';
import meteorVert from './shaders/meteor.vert?raw';
import meteorFrag from './shaders/meteor.frag?raw';

function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const omega = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  if (omega < 1e-6) return a;
  const s = Math.sin(omega);
  const ka = Math.sin((1 - t) * omega) / s;
  const kb = Math.sin(t * omega) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}

/** 꼬리의 최대 폭(라디안) */
const HALF_WIDTH = 0.0035;

export class Meteors {
  readonly mesh: THREE.Mesh;
  readonly schedule: MeteorSchedule;
  private readonly material: THREE.ShaderMaterial;
  private readonly positions = new Float32Array(4 * 3);
  /** 지금 보이는 별똥별 머리의 방향(월드 벡터). 없으면 null */
  head: Vec3 | null = null;

  constructor(seed: number) {
    this.schedule = new MeteorSchedule(seed);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    // 꼭짓점 순서: 꼬리(-), 꼬리(+), 머리(-), 머리(+)
    geometry.setAttribute('aTrail', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), 2));
    geometry.setIndex([0, 1, 2, 2, 1, 3]);
    this.material = new THREE.ShaderMaterial({
      vertexShader: meteorVert,
      fragmentShader: meteorFrag,
      uniforms: { uBright: { value: 0 } },
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
    this.mesh.renderOrder = ORDER.meteors;
    this.mesh.visible = false;
  }

  /**
   * @param time 애니메이션 시각(초)
   * @param night 밤인 정도 0~1 (낮에는 안 보임)
   * @returns 지금 별똥별이 보이는지
   */
  update(time: number, enabled: boolean, night: number): boolean {
    const m = enabled && night > 0.3 ? this.schedule.activeAt(time) : null;
    if (!m) {
      this.mesh.visible = false;
      this.head = null;
      return false;
    }
    const shape = meteorShape((time - m.start) / m.duration);
    const head = slerp(m.from, m.to, shape.head);
    const tail = slerp(m.from, m.to, shape.tail);
    this.head = head;
    // 진행 방향에 수직인(하늘에 붙은) 방향
    const side: Vec3 = [
      head[1] * tail[2] - head[2] * tail[1],
      head[2] * tail[0] - head[0] * tail[2],
      head[0] * tail[1] - head[1] * tail[0],
    ];
    const len = Math.hypot(side[0], side[1], side[2]) || 1;
    const w = HALF_WIDTH * (0.7 + 0.5 * m.brightness);
    const sx = (side[0] / len) * w;
    const sy = (side[1] / len) * w;
    const sz = (side[2] / len) * w;
    this.positions.set([tail[0] - sx, tail[1] - sy, tail[2] - sz], 0);
    this.positions.set([tail[0] + sx, tail[1] + sy, tail[2] + sz], 3);
    this.positions.set([head[0] - sx, head[1] - sy, head[2] - sz], 6);
    this.positions.set([head[0] + sx, head[1] + sy, head[2] + sz], 9);
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.material.uniforms.uBright.value = shape.fade * m.brightness * night;
    this.mesh.visible = true;
    return true;
  }
}
