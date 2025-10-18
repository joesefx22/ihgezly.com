// 🟢 فحص قوة كلمة المرور
function checkPasswordStrength() {
  const password = document.getElementById("password").value;
  const strengthBar = document.getElementById("passwordStrength");
  const lengthIcon = document.getElementById("lengthIcon");
  const upperLowerIcon = document.getElementById("upperLowerIcon");
  const numberIcon = document.getElementById("numberIcon");

  let strength = 0;

  // تحقق من الطول
  if (password.length >= 6) {
    strength += 1;
    lengthIcon.className = "bi bi-check-circle-fill";
  } else {
    lengthIcon.className = "bi bi-x-circle-fill";
  }

  // تحقق من وجود أحرف كبيرة وصغيرة
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
    strength += 1;
    upperLowerIcon.className = "bi bi-check-circle-fill";
  } else {
    upperLowerIcon.className = "bi bi-x-circle-fill";
  }

  // تحقق من وجود أرقام
  if (/\d/.test(password)) {
    strength += 1;
    numberIcon.className = "bi bi-check-circle-fill";
  } else {
    numberIcon.className = "bi bi-x-circle-fill";
  }

  // تحديث شريط القوة
  switch (strength) {
    case 0:
      strengthBar.style.width = "0%";
      strengthBar.style.background = "transparent";
      break;
    case 1:
      strengthBar.style.width = "33%";
      strengthBar.style.background = "#dc3545";
      break;
    case 2:
      strengthBar.style.width = "66%";
      strengthBar.style.background = "#ffc107";
      break;
    case 3:
      strengthBar.style.width = "100%";
      strengthBar.style.background = "#28a745";
      break;
  }
}

// 🔁 تحقق من تطابق كلمة المرور
function checkPasswordMatch() {
  const password = document.getElementById("password");
  const confirmPassword = document.getElementById("confirmPassword");

  if (confirmPassword.value === password.value) {
    confirmPassword.classList.remove("is-invalid");
    confirmPassword.classList.add("is-valid");
  } else {
    confirmPassword.classList.remove("is-valid");
    confirmPassword.classList.add("is-invalid");
  }
}

// 🧩 معالجة إرسال النموذج
document.getElementById("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const form = e.target;

  if (!form.checkValidity()) {
    e.stopPropagation();
    form.classList.add("was-validated");
    return;
  }

  const data = {
    username: form.username.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    password: form.password.value,
    confirmPassword: form.confirmPassword.value,
    role: form.role.value,
  };

  if (data.password !== data.confirmPassword) {
    showAlert("كلمات المرور غير متطابقة", "danger");
    return;
  }

  // إرسال البيانات للسيرفر
  try {
    const response = await fetch("/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (response.ok) {
      showAlert("تم إنشاء الحساب بنجاح ✅", "success");
      setTimeout(() => (window.location.href = "/login.html"), 1500);
    } else {
      showAlert(result.message || "حدث خطأ أثناء إنشاء الحساب", "danger");
    }
  } catch (err) {
    showAlert("حدث خطأ في الاتصال بالسيرفر", "danger");
  }
});

// ⚠️ نظام التنبيهات
function showAlert(message, type = "success") {
  const container = document.getElementById("alertsContainer");
  const alert = document.createElement("div");
  alert.className = `alert alert-${type}`;
  alert.innerHTML = message;
  container.innerHTML = "";
  container.appendChild(alert);
  setTimeout(() => alert.remove(), 4000);
}
