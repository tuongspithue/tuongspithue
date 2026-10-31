// Cầu nối trình duyệt cho app web Ship Quanh Tôi (dùng chung 3 app): cài lên màn hình chính,
// thông báo đẩy (Web Push), giữ màn hình sáng, chuông báo khi trang đang mở.
(function () {
  let installEvent = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
  });

  let wakeLock = null;
  let wantWake = false;
  async function requestWake() {
    if (!('wakeLock' in navigator)) return false;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      return true;
    } catch (_) {
      return false;
    }
  }
  // Trình duyệt tự nhả wake lock khi ẩn trang; xin lại khi quay về.
  document.addEventListener('visibilitychange', () => {
    if (wantWake && document.visibilityState === 'visible') requestWake();
  });

  let audio = null;
  let alarmTimer = null;
  function beep() {
    if (!audio) return;
    const now = audio.currentTime;
    [0, 0.25, 0.5].forEach((t, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = i === 1 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(0.6, now + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.2);
      o.connect(g).connect(audio.destination);
      o.start(now + t);
      o.stop(now + t + 0.22);
    });
    if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
  }

  function urlBase64ToUint8Array(base64) {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  window.sqt = {
    isStandalone: () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true,
    isIos: () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    isMobile: () => /android|iphone|ipad|ipod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1,
    canPromptInstall: () => installEvent !== null,
    promptInstall: async () => {
      if (!installEvent) return false;
      installEvent.prompt();
      const choice = await installEvent.userChoice;
      installEvent = null;
      return choice.outcome === 'accepted';
    },
    keepScreenOn: async (on) => {
      wantWake = on;
      if (!on) {
        if (wakeLock) await wakeLock.release().catch(() => {});
        wakeLock = null;
        return true;
      }
      return requestWake();
    },
    // Phải gọi từ một lần bấm của người dùng (chính sách tự phát âm thanh của trình duyệt).
    unlockAudio: () => {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      audio.resume();
      beep();
      return true;
    },
    alarm: (on) => {
      if (on && !alarmTimer) {
        beep();
        alarmTimer = setInterval(beep, 1500);
      } else if (!on && alarmTimer) {
        clearInterval(alarmTimer);
        alarmTimer = null;
      }
    },
    pushSupported: () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    // Trả JSON đăng ký (endpoint + keys) hoặc null nếu người dùng không cho phép.
    subscribePush: async (vapidKey) => {
      if (!window.sqt.pushSupported()) return null;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return null;
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) }));
      return JSON.stringify(sub.toJSON());
    },
    pushPermission: () => ('Notification' in window ? Notification.permission : 'unsupported'),
  };

  window.addEventListener('flutter-first-frame', () => document.getElementById('splash')?.remove());

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
  }
})();
