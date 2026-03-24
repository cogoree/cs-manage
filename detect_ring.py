import sounddevice as sd
import numpy as np
import time
import json
import os
import threading
import subprocess
import sys

# ====== 설정 ======
TARGET_URL = "https://cogoree.github.io/cs-manage/"
RING_THRESHOLD = 0.02       # 노이즈 최대 0.006보다 충분히 높게
ACTIVE_SECONDS = 1.0        # 1초 이상 지속돼야 통화로 판정
SILENCE_SECONDS = 2.0       # 2초 무음이면 통화 종료로 판정
COOLDOWN = 5                # 재감지 대기시간
CONFIG_FILE = "rt151_config.json"
WARMUP_SECONDS = 3.0        # 시작 후 3초간 감지 무시
# ==================

_popup_open = False
POPUP_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "popup.py")

def show_popup():
    global _popup_open
    if _popup_open:
        return
    _popup_open = True

    def _run():
        global _popup_open
        try:
            subprocess.run([sys.executable, POPUP_SCRIPT], timeout=30)
        except Exception as e:
            print(f"\n❌ 팝업 오류: {e}")
        finally:
            _popup_open = False

    threading.Thread(target=_run, daemon=True).start()


def save_config(index, rate):
    with open(CONFIG_FILE, 'w') as f:
        json.dump({"device_index": index, "samplerate": rate}, f)

def load_config():
    if not os.path.exists(CONFIG_FILE):
        return None, None
    with open(CONFIG_FILE, 'r') as f:
        cfg = json.load(f)
    return cfg["device_index"], cfg["samplerate"]

def find_rt151():
    print("🔍 RT-151 자동 탐색 중...\n")
    usb_devices = []
    for i, d in enumerate(sd.query_devices()):
        if d['max_input_channels'] > 0 and 'USB Audio' in d['name']:
            usb_devices.append((i, int(d['default_samplerate'])))
            print(f"  발견: [{i}] {d['name']} | {int(d['default_samplerate'])}Hz")

    if not usb_devices:
        print("❌ USB Audio Device를 찾지 못했습니다.")
        return None, None

    if len(usb_devices) == 1:
        idx, rate = usb_devices[0]
        print(f"\n✅ RT-151 자동 선택: [{idx}]번")
        save_config(idx, rate)
        return idx, rate

    print(f"\n📞 {len(usb_devices)}개 발견. 전화벨 울려주세요! (각 5초씩)\n")
    best_idx, best_rate, best_level = None, None, 0.0

    for idx, rate in usb_devices:
        print(f"[{idx}]번 테스트 중...")
        try:
            max_level = 0.0
            with sd.InputStream(device=idx, channels=1, samplerate=rate, blocksize=1024) as stream:
                for _ in range(50):
                    data, _ = stream.read(1024)
                    level = float(np.max(np.abs(data)))
                    if level > max_level:
                        max_level = level
                    bar = int(level * 40)
                    print(f"\r  {'█' * bar}{' ' * (40-bar)} {level:.4f}", end="", flush=True)
                    time.sleep(0.1)
            print(f"\n  최대: {max_level:.4f}")
            if max_level > best_level:
                best_level = max_level
                best_idx = idx
                best_rate = rate
        except Exception as e:
            print(f"\n  오류: {e}")

    print(f"\n✅ RT-151: [{best_idx}]번")
    save_config(best_idx, best_rate)
    return best_idx, best_rate


class CallDetector:
    def __init__(self):
        self.active_start = None
        self.silence_start = None
        self.last_popup_time = 0
        self.is_in_call = False
        self.start_time = time.time()

    def process(self, level):
        now = time.time()

        if now - self.start_time < WARMUP_SECONDS:
            return

        is_active = level > RING_THRESHOLD

        if is_active:
            self.silence_start = None
            if self.active_start is None:
                self.active_start = now
            elif not self.is_in_call and (now - self.active_start) >= ACTIVE_SECONDS:
                if (now - self.last_popup_time) > COOLDOWN:
                    print(f"\n📞 [{time.strftime('%H:%M:%S')}] 통화 감지! 알림 표시...")
                    show_popup()
                    self.last_popup_time = now
                    self.is_in_call = True
        else:
            if self.active_start is not None:
                if self.silence_start is None:
                    self.silence_start = now
                elif (now - self.silence_start) >= SILENCE_SECONDS:
                    if self.is_in_call:
                        print(f"\n🔕 [{time.strftime('%H:%M:%S')}] 통화 종료 - 재감지 대기중...")
                    self.active_start = None
                    self.silence_start = None
                    self.is_in_call = False
            else:
                self.silence_start = None


def main():
    device_index, samplerate = load_config()

    if device_index is not None:
        print(f"✅ 저장된 설정: [{device_index}]번 | {samplerate}Hz")
        print("   (재탐색: rt151_config.json 삭제 후 재실행)\n")
    else:
        device_index, samplerate = find_rt151()
        if device_index is None:
            input("\nEnter를 눌러 종료...")
            return

    detector = CallDetector()
    print(f"🎧 통화 감지 대기 중... (Ctrl+C로 종료)")
    print(f"   시작 후 {WARMUP_SECONDS}초 워밍업 후 감지 시작됩니다.\n")

    def callback(indata, frames, time_info, status):
        level = float(np.max(np.abs(indata)))
        detector.process(level)
        bar = int(level * 50)
        marker = "🔴" if level > RING_THRESHOLD else "  "
        print(f"\r{marker} {'█' * bar}{' ' * (50-bar)} {level:.4f}", end="", flush=True)

    with sd.InputStream(device=device_index, channels=1,
                        samplerate=samplerate, callback=callback, blocksize=1024):
        try:
            while True:
                time.sleep(0.05)
        except KeyboardInterrupt:
            print("\n\n종료됨")

if __name__ == "__main__":
    main()