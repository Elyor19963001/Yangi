(() => {
  let countdownTimer = null;

  function getEl(id) {
    return document.getElementById(id);
  }

  function ensureControls(otpForm) {
    let button = getEl('resendOtp');
    let label = getEl('otpCountdown');
    if (button && label) return { button, label };

    const wrap = document.createElement('div');
    wrap.className = 'otp-resend-row';
    wrap.style.display = 'flex';
    wrap.style.gap = '10px';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'space-between';
    wrap.style.flexWrap = 'wrap';

    label = document.createElement('small');
    label.id = 'otpCountdown';
    label.textContent = 'Kod kelmadimi?';

    button = document.createElement('button');
    button.id = 'resendOtp';
    button.type = 'button';
    button.className = 'btn btn-secondary';
    button.textContent = 'OTPni qayta yuborish';

    wrap.append(label, button);
    const backButton = getEl('backToRegister');
    if (backButton) otpForm.insertBefore(wrap, backButton);
    else otpForm.appendChild(wrap);
    return { button, label };
  }

  function setCountdown(seconds) {
    const button = getEl('resendOtp');
    const label = getEl('otpCountdown');
    if (!button || !label) return;

    if (countdownTimer) clearInterval(countdownTimer);
    let remaining = Math.max(0, Number(seconds) || 0);

    const render = () => {
      if (remaining > 0) {
        button.disabled = true;
        label.textContent = `Qayta yuborish: ${remaining}s`;
      } else {
        button.disabled = false;
        label.textContent = 'Kod kelmadimi?';
        if (countdownTimer) clearInterval(countdownTimer);
        countdownTimer = null;
      }
      remaining -= 1;
    };

    render();
    countdownTimer = setInterval(render, 1000);
  }

  async function resendOtp() {
    const button = getEl('resendOtp');
    const info = getEl('otpInfo');
    const message = getEl('authMessage');
    const phone = typeof state !== 'undefined' ? state.pendingPhone : '';

    if (!phone) {
      if (message) {
        message.textContent = 'Telefon raqamini qayta kiriting.';
        message.className = 'form-message error';
      }
      return;
    }

    button.disabled = true;
    if (message) {
      message.textContent = 'Yangi OTP yuborilmoqda…';
      message.className = 'form-message';
    }

    try {
      const response = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      let payload = null;
      try { payload = await response.json(); } catch { payload = null; }

      if (!response.ok) {
        const error = new Error(payload?.error || `HTTP ${response.status}`);
        error.retryAfterSeconds = payload?.retry_after_seconds;
        throw error;
      }

      if (payload?.dev_otp) {
        if (info) info.textContent = `Test rejimi: yangi OTP kodi ${payload.dev_otp}.`;
        const otpInput = getEl('otp');
        if (otpInput) otpInput.value = payload.dev_otp;
      } else if (info) {
        info.textContent = 'Yangi OTP SMS orqali yuborildi.';
      }

      if (message) {
        message.textContent = 'Yangi OTP yuborildi.';
        message.className = 'form-message success';
      }
      setCountdown(payload?.resend_after_seconds || 60);
    } catch (error) {
      if (message) {
        message.textContent = error.message;
        message.className = 'form-message error';
      }
      setCountdown(error.retryAfterSeconds || 15);
    }
  }

  function initResendUi() {
    const otpForm = getEl('otpForm');
    if (!otpForm) return;
    const { button } = ensureControls(otpForm);
    button.addEventListener('click', resendOtp);

    const observer = new MutationObserver(() => {
      if (!otpForm.classList.contains('hidden')) setCountdown(60);
    });
    observer.observe(otpForm, { attributes: true, attributeFilter: ['class'] });

    if (!otpForm.classList.contains('hidden')) setCountdown(60);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initResendUi);
  else initResendUi();
})();
