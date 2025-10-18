// ✅ عند تحميل الصفحة
document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginStep1");
  const otpSection = document.getElementById("loginStep2");
  const backToStep1Btn = document.getElementById("backToStep1");
  const otpForm = document.getElementById("otpForm");
  const otpInputs = document.querySelectorAll(".otp-input");
  const resendOtp = document.getElementById("resendOtp");
  const countdown = document.getElementById("countdown");
  const passwordToggle = document.getElementById("passwordToggle");
  const passwordInput = document.getElementById("password");
  const pendingEmail = document.getElementById("pendingEmail");
  const alertsContainer = document.getElementById("alertsContainer");

  let timer;
  let timeLeft = 60;

  // 👁️ تبديل إظهار/إخفاء كلمة المرور
  passwordToggle.addEventListener("click", () => {
    if (passwordInput.type === "password") {
      passwordInput.type = "text";
      passwordToggle.innerHTML = '<i class="bi bi-eye-slash"></i>';
    } else {
      passwordInput.type = "password";
      passwordToggle.innerHTML = '<i class="bi bi-eye"></i>';
    }
  });

  // ⚙️ إرسال نموذج تسجيل الدخول (الخطوة الأولى)
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!loginForm.checkValidity()) {
      loginForm.classList.add("was-validated");
      return;
    }

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    showAlert("جاري التحقق من البيانات...", "info");

    try {
      // طلب إرسال رمز تحقق (مثال توضيحي)
      const res = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (data.success) {
        pendingEmail.value = email;
        switchToStep2();
        startCountdown();
      } else {
        showAlert(data.message || "فشل تسجيل الدخول، تحقق من البيانات.", "danger");
      }
    } catch (err) {
      showAlert("حدث خطأ أثناء الاتصال بالخادم.", "danger");
    }
  });

  // 🔙 العودة للخطوة الأولى
  backToStep1Btn.addEventListener("click", () => {
    otpSection.style.display = "none";
    loginForm.style.display = "block";
    clearInterval(timer);
  });

  // 🔁 إعادة إرسال الرمز
  resendOtp.addEventListener("click", async (e) => {
    e.preventDefault();
    if (timeLeft > 0) return;

    showAlert("جاري إرسال رمز جديد...", "info");
    try {
      const res = await fetch("/api/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail.value }),
      });
      const data = await res.json();
      if (data.success) {
        showAlert("تم إرسال الرمز بنجاح.", "success");
        startCountdown();
      } else {
        showAlert("فشل في إرسال الرمز.", "danger");
      }
    } catch {
      showAlert("خطأ أثناء إرسال الرمز.", "danger");
    }
  });

  // 🔢 التحقق من الرمز
  otpForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const otp = Array.from(otpInputs).map((input) => input.value).join("");

    if (otp.length !== 6) {
      showAlert("يرجى إدخال الرمز الكامل المكون من 6 أرقام.", "warning");
      return;
    }

    showAlert("جارٍ التحقق من الرمز...", "info");

    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail.value, otp }),
      });
      const data = await res.json();

      if (data.success) {
        showAlert("تم تسجيل الدخول بنجاح ✅", "success");
        setTimeout(() => (window.location.href = "/dashboard.html"), 1500);
      } else {
        showAlert("الرمز غير صحيح أو منتهي الصلاحية.", "danger");
      }
    } catch {
      showAlert("حدث خطأ أثناء التحقق من الرمز.", "danger");
    }
  });

  // 🧩 التنقل بين حقول OTP تلقائياً
  otpInputs.forEach((input, index) => {
    input.addEventListener("input", (e) => {
      const value = e.target.value;
      if (value && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus();
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !e.target.value && index > 0) {
        otpInputs[index - 1].focus();
      }
    });
  });

  // 🧭 الدوال المساعدة
  function switchToStep2() {
    loginForm.style.display = "none";
    otpSection.style.display = "block";
  }

  function startCountdown() {
    clearInterval(timer);
    timeLeft = 60;
    countdown.textContent = `يمكنك إعادة الإرسال بعد ${timeLeft} ثانية`;
    timer = setInterval(() => {
      timeLeft--;
      if (timeLeft <= 0) {
        clearInterval(timer);
        countdown.textContent = "يمكنك الآن إعادة إرسال الرمز.";
      } else {
        countdown.textContent = `يمكنك إعادة الإرسال بعد ${timeLeft} ثانية`;
      }
    }, 1000);
  }

  function showAlert(message, type = "info") {
    alertsContainer.innerHTML = `
      <div class="alert alert-${type} alert-dismissible fade show text-start" role="alert">
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      </div>`;
  }
});
