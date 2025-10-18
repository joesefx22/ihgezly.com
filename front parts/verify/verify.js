// 🆕 دالة لعرض التنبيهات
function showAlert(message, type = 'info') {
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type} alert-dismissible fade show mt-3`;
  alertDiv.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  const actionButtons = document.getElementById('actionButtons');
  actionButtons.parentNode.insertBefore(alertDiv, actionButtons);
  setTimeout(() => alertDiv.remove(), 5000);
}

(async function () {
  const messageEl = document.getElementById('message');
  const homeLink = document.getElementById('homeLink');
  const loginLink = document.getElementById('loginLink');
  const loader = document.getElementById('loader');
  const content = document.getElementById('content');
  const icon = document.getElementById('icon');

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  if (!token) {
    showError('❌ الرابط غير صالح أو ناقص رمز التحقق.');
    return;
  }

  try {
    const response = await fetch(`/verify-email?token=${encodeURIComponent(token)}`);
    if (response.ok) {
      const html = await response.text();
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      const successText = tempDiv.querySelector('h2')?.textContent || 'تم تفعيل حسابك بنجاح! 🎉';
      showSuccess(successText);
    } else {
      const errorText = await response.text();
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = errorText;
      const errorMessage = tempDiv.querySelector('h2')?.textContent || tempDiv.querySelector('p')?.textContent || 'فشل في تفعيل الحساب';
      showError(errorMessage);
    }
  } catch (err) {
    console.error('Error:', err);
    showError('❌ حدث خطأ في الاتصال بالخادم. يرجى المحاولة مرة أخرى.');
  }

  function showSuccess(message) {
    loader.style.display = 'none';
    icon.innerHTML = '✅';
    icon.classList.add('success-icon');
    messageEl.innerHTML = `<span class="success">${message}</span>`;
    messageEl.innerHTML += '<br><br><small>يمكنك الآن تسجيل الدخول إلى حسابك والاستفادة من جميع المزايا.</small>';
    content.style.display = 'block';
    loginLink.style.display = 'inline-block';
    homeLink.style.display = 'inline-block';
    showAlert('✅ تم تفعيل حسابك بنجاح! يمكنك الآن تسجيل الدخول.', 'success');
  }

  function showError(message) {
    loader.style.display = 'none';
    icon.innerHTML = '❌';
    icon.classList.add('error-icon');
    messageEl.innerHTML = `<span class="error">${message}</span>`;
    messageEl.innerHTML += '<br><br><small>إذا استمرت المشكلة، يرجى التواصل مع الدعم الفني.</small>';
    content.style.display = 'block';
    homeLink.style.display = 'inline-block';
    loginLink.style.display = 'none';
    showAlert('❌ ' + message, 'danger');
  }
})();

document.addEventListener('DOMContentLoaded', function() {
  const buttons = document.querySelectorAll('.btn');
  buttons.forEach(btn => {
    btn.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-2px)';
    });
    btn.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0)';
    });
  });
  if ('ontouchstart' in window) {
    document.body.style.padding = '10px';
  }
});

function retryVerification() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    window.location.href = `/verify-email?token=${encodeURIComponent(token)}`;
  } else {
    window.location.href = '/login.html';
  }
}

function addRetryButton() {
  const actionButtons = document.getElementById('actionButtons');
  const retryButton = document.createElement('button');
  retryButton.className = 'btn btn-warning';
  retryButton.innerHTML = '<i class="bi bi-arrow-clockwise me-2"></i>إعادة المحاولة';
  retryButton.onclick = retryVerification;
  actionButtons.appendChild(retryButton);
}
