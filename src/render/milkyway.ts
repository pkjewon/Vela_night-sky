// 은하수 텍스처 불러오기. 별이 먼저 보이도록 첫 화면이 뜬 뒤에 따로 받는다.
// 텍스처: ESA/Gaia/DPAC (CC BY-SA 3.0 IGO)를 흐리게 가공한 것. 가로=적경, 세로=적위.
import * as THREE from 'three';

export function loadMilkyWay(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (texture) => {
        // 적경 0°와 360°가 이어지도록 가로는 반복. 이음매에 줄이 생기지 않게 밉맵은 쓰지 않는다.
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = THREE.NoColorSpace;
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      () => reject(new Error('은하수 그림을 불러오지 못했습니다')),
    );
  });
}
