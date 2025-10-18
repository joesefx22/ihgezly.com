// التهيئة
document.addEventListener('DOMContentLoaded', function() {
  // إعداد الفلاتر
  document.getElementById('areaFilter').addEventListener('change', filterPitches);
  document.getElementById('sortFilter').addEventListener('change', filterPitches);
  document.getElementById('typeFilter').addEventListener('change', filterPitches);
  
  // إعداد سبب الإلغاء
  document.getElementById('cancellationReason').addEventListener('change', function() {
    const otherReason = document.getElementById('otherReason');
    otherReason.style.display = this.value === 'آخر' ? 'block' : 'none';
  });

  // جلب رمز CSRF
  fetch('/csrf-token')
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      if (d?.csrfToken) {
        document.getElementById('csrfToken').value = d.csrfToken;
        document.getElementById('ratingCsrfToken').value = d.csrfToken;
      }
    });

  window.addEventListener('scroll', function() {
    if (window.scrollY > 100) {
      document.querySelector('.navbar').classList.add('scrolled');
    } else {
      document.querySelector('.navbar').classList.remove('scrolled');
    }
  });

  // تحميل البيانات
  loadPitchesData();

  // إخفاء شاشة التحميل
  window.addEventListener('load', () => {
    setTimeout(() => {
      document.getElementById('loadingOverlay').classList.add('fade-out');
    }, 1000);
  });
});