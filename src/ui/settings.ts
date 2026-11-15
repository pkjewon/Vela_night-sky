// 설정 패널: 화면 아래쪽(한 손으로 닿는 곳)의 시트. 바꾼 값은 기기에 저장된다.
import { CITIES } from '../input/location';
import type { SettingKey, Settings } from '../state';

export const GPS_OPTION = '__gps__';

export interface SettingsHandlers {
  onChange(key: SettingKey, value: boolean): void;
  /** 위치 선택: 도시 이름 또는 GPS_OPTION */
  onCity(value: string): void;
  onCalibrationReset(): void;
}

export class SettingsPanel {
  private readonly root = document.getElementById('settings')!;
  private readonly inputs = new Map<SettingKey, HTMLInputElement>();
  private readonly citySelect = document.getElementById('city-select') as HTMLSelectElement;
  private readonly calibValue = document.getElementById('calib-value')!;

  constructor(handlers: SettingsHandlers) {
    for (const input of this.root.querySelectorAll<HTMLInputElement>('input[data-setting]')) {
      const key = input.dataset.setting as SettingKey;
      this.inputs.set(key, input);
      input.addEventListener('change', () => handlers.onChange(key, input.checked));
    }
    const gps = document.createElement('option');
    gps.value = GPS_OPTION;
    gps.textContent = '내 위치';
    this.citySelect.appendChild(gps);
    for (const c of CITIES) {
      const o = document.createElement('option');
      o.value = c.name;
      o.textContent = c.name;
      this.citySelect.appendChild(o);
    }
    this.citySelect.addEventListener('change', () => handlers.onCity(this.citySelect.value));
    document.getElementById('calib-reset')!.addEventListener('click', handlers.onCalibrationReset);
    document.getElementById('settings-close')!.addEventListener('click', () => this.close());
    document.getElementById('btn-settings')!.addEventListener('click', () => this.toggle());
  }

  sync(settings: Settings): void {
    for (const [key, input] of this.inputs) input.checked = settings[key];
  }

  /** 지금 기준 위치를 선택 상자에 표시한다. 목록에 없는 곳(URL 좌표 등)은 "내 위치" 자리에 이름을 보여 준다. */
  setPlace(name: string, isCity: boolean): void {
    const gps = this.citySelect.options[0];
    gps.textContent = isCity || name === '내 위치' ? '내 위치' : `${name}`;
    this.citySelect.value = isCity ? name : GPS_OPTION;
  }

  setCalibration(offsetDeg: number): void {
    this.calibValue.textContent =
      Math.abs(offsetDeg) < 0.05
        ? '센서 모드에서 좌우로 드래그해 맞춰요'
        : `지금 ${offsetDeg > 0 ? '+' : ''}${offsetDeg.toFixed(1)}° 보정됨`;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
  }
}
