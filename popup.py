import tkinter as tk
import webbrowser
import ctypes

TARGET_URL = "https://cogoree.github.io/cs-manage/"

def find_and_focus_browser():
    """크롬에서 cs-manage 탭 찾아서 활성화"""
    try:
        import pygetwindow as gw
        all_windows = gw.getAllWindows()

        keywords = [
            "cogoree.github.io/cs-manage",
            "cs-manage",
            "cogoree",
        ]
        for win in all_windows:
            if not win.title:
                continue
            title_lower = win.title.lower()
            if any(kw in title_lower for kw in keywords):
                _activate(win)
                print(f"✅ 기존 창 활성화: {win.title}")
                return True

    except Exception as e:
        print(f"⚠️ 창 찾기 실패: {e}")

    return False

def _activate(win):
    """창 활성화 - 최소화 복원 후 포커스"""
    try:
        if win.isMinimized:
            win.restore()
        win.activate()
    except Exception:
        pass
    try:
        # Windows API로 강제 포커스
        ctypes.windll.user32.SetForegroundWindow(win._hWnd)
    except Exception:
        pass

def open_site():
    # 디버그: 열린 창 제목 출력 (문제 시 확인용)
    try:
        import pygetwindow as gw
        titles = [w.title for w in gw.getAllWindows() if w.title]
        print("=== 현재 열린 창 목록 ===")
        for t in titles:
            print(f"  {t}")
        print("========================")
    except Exception:
        pass

    if not find_and_focus_browser():
        print("🌐 새 창으로 오픈...")
        webbrowser.open(TARGET_URL)

def show():
    root = tk.Tk()
    root.overrideredirect(True)
    root.attributes("-topmost", True)
    root.attributes("-alpha", 0.0)

    W, H = 360, 130
    sw = root.winfo_screenwidth()
    sh = root.winfo_screenheight()
    x = sw - W - 24
    y = sh - H - 60
    root.geometry(f"{W}x{H}+{x}+{y}")
    root.configure(bg="#0f1117")

    outer = tk.Frame(root, bg="#3b82f6")
    outer.place(x=0, y=0, width=W, height=H)

    inner = tk.Frame(outer, bg="#0f1117")
    inner.place(x=2, y=2, width=W-4, height=H-4)

    tk.Frame(inner, bg="#3b82f6", height=4).pack(fill="x")

    body = tk.Frame(inner, bg="#0f1117")
    body.pack(fill="both", expand=True, padx=16, pady=10)

    icon_bg = tk.Frame(body, bg="#1e3a5f", width=48, height=48)
    icon_bg.pack(side="left", padx=(0, 14))
    icon_bg.pack_propagate(False)
    tk.Label(icon_bg, text="☎", font=("Segoe UI Emoji", 20),
             bg="#1e3a5f", fg="#60a5fa").place(relx=0.5, rely=0.5, anchor="center")

    text_frame = tk.Frame(body, bg="#0f1117")
    text_frame.pack(side="left", fill="both", expand=True)

    tk.Label(text_frame, text="통화가 감지되었습니다",
             font=("맑은 고딕", 11, "bold"),
             bg="#0f1117", fg="#ffffff", anchor="w").pack(fill="x")

    tk.Label(text_frame, text="CS Manager를 열까요?",
             font=("맑은 고딕", 9),
             bg="#0f1117", fg="#94a3b8", anchor="w").pack(fill="x", pady=(2, 8))

    btn_row = tk.Frame(text_frame, bg="#0f1117")
    btn_row.pack(fill="x")

    def on_confirm():
        root.destroy()
        open_site()

    def on_cancel():
        root.destroy()

    tk.Button(btn_row, text="  열기  ", command=on_confirm,
              bg="#3b82f6", fg="#ffffff", relief="flat", bd=0,
              font=("맑은 고딕", 9, "bold"),
              cursor="hand2", padx=8, pady=4).pack(side="left", padx=(0, 6))

    tk.Button(btn_row, text="  닫기  ", command=on_cancel,
              bg="#1e293b", fg="#94a3b8", relief="flat", bd=0,
              font=("맑은 고딕", 9),
              cursor="hand2", padx=8, pady=4).pack(side="left")

    countdown_label = tk.Label(body, text="10",
                               font=("맑은 고딕", 9),
                               bg="#0f1117", fg="#475569")
    countdown_label.pack(side="right", anchor="n")

    def update_countdown(n):
        try:
            countdown_label.config(text=str(n))
            if n > 0:
                root.after(1000, lambda: update_countdown(n - 1))
            else:
                root.destroy()
        except Exception:
            pass

    update_countdown(10)

    def fade_in(alpha=0.0):
        alpha = min(alpha + 0.1, 0.97)
        root.attributes("-alpha", alpha)
        if alpha < 0.97:
            root.after(15, lambda: fade_in(alpha))

    fade_in()
    root.mainloop()

if __name__ == "__main__":
    show()