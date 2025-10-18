// جلب رمز CSRF
fetch('/csrf-token')
  .then(r => r.ok ? r.json() : null)
  .then(d => {
    if (d?.csrfToken) {
      document.getElementById('csrfToken').value = d.csrfToken;
    }
  });

// جلب بيانات الملف الشخصي
async function loadProfile() {
  try {
    const response = await fetch('/api/user/profile');
    if (!response.ok) throw new Error('Failed to load profile');
    const data = await response.json();
    displayProfile(data);
    loadCompensationCodes();
  } catch (error) {
    console.error('Error loading profile:', error);
    alert('حدث خطأ في تحميل الملف الشخصي');
  }
}

// عرض بيانات الملف الشخصي
function displayProfile(data) {
  const { profile, stats } = data;
  document.getElementById('profileName').textContent = profile.nickname;
  document.getElementById('profileAge').textContent = profile.age ? `العمر: ${profile.age}` : 'العمر: غير محدد';
  document.getElementById('memberSince').textContent = `عضو منذ: ${new Date(profile.joinDate).toLocaleDateString('ar-EG')}`;
  if (profile.avatar) document.getElementById('avatarImage').src = profile.avatar;
  document.getElementById('nickname').value = profile.nickname;
  if (profile.age) document.getElementById('age').value = profile.age;
  document.getElementById('bio').value = profile.bio || '';
  document.getElementById('totalBookings').textContent = stats.totalBookings;
  document.getElementById('successfulBookings').textContent = stats.successfulBookings;
  document.getElementById('cancelledBookings').textContent = stats.cancelledBookings;
  document.getElementById('totalSpent').textContent = stats.totalSpent;
}

// تحميل أكواد التعويض
async function loadCompensationCodes() {
  try {
    const response = await fetch('/api/user/compensation-codes');
    if (response.ok) {
      const codes = await response.json();
      displayCompensationCodes(codes);
    }
  } catch (error) {
    console.error('Error loading compensation codes:', error);
  }
}

// عرض أكواد التعويض
function displayCompensationCodes(codes) {
  const container = document.getElementById('compensationCodes');
  if (codes.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4">
        <i class="bi bi-ticket-perforated display-4 text-muted"></i>
        <p class="text-muted mt-2">لا توجد أكواد تعويض نشطة</p>
      </div>`;
    return;
  }

  container.innerHTML = codes.map(code => `
    <div class="compensation-code">
      <div class="d-flex justify-content-between align-items-center">
        <div>
          <h6 class="mb-1">كود التعويض</h6>
          <div class="code-value">${code.code}</div>
          <p class="mb-1">قيمة الكود: ${code.value} جنيه</p>
          <p class="mb-1">صالح حتى: ${new Date(code.expiresAt).toLocaleDateString('ar-EG')}</p>
          <p class="mb-0"><small>${code.message}</small></p>
        </div>
        <div class="text-left">
          <span class="badge bg-light text-dark">نشط</span>
          <div class="countdown mt-2" id="countdown-${code.id}"></div>
        </div>
      </div>
    </div>`).join('');

  codes.forEach(code => startCountdown(code.id, code.expiresAt));
}

// العد التنازلي لصلاحية الأكواد
function startCountdown(codeId, expiresAt) {
  const countdownElement = document.getElementById(`countdown-${codeId}`);
  const expiryDate = new Date(expiresAt);
  function updateCountdown() {
    const now = new Date();
    const timeLeft = expiryDate - now;
    if (timeLeft <= 0) {
      countdownElement.textContent = 'منتهي الصلاحية';
      countdownElement.className = 'countdown text-danger';
      return;
    }
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    countdownElement.textContent = `متبقي: ${days} يوم و ${hours} ساعة`;
    countdownElement.className = days < 3 ? 'countdown text-warning' : 'countdown text-light';
  }
  updateCountdown();
  setInterval(updateCountdown, 60000);
}

// معاينة الصورة الشخصية
function previewAvatar(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = e => document.getElementById('avatarImage').src = e.target.result;
    reader.readAsDataURL(input.files[0]);
  }
}

// إرسال النموذج
document.getElementById('profileForm').addEventListener('submit', async e => {
  e.preventDefault();
  const formData = new FormData(e.target);
  try {
    const response = await fetch('/api/user/profile', { method: 'PUT', body: formData });
    const data = await response.json();
    if (response.ok) {
      alert('✅ ' + data.message);
      loadProfile();
    } else {
      alert('❌ ' + data.message);
    }
  } catch (error) {
    console.error('Error updating profile:', error);
    alert('❌ حدث خطأ أثناء تحديث الملف الشخصي');
  }
});

// تسجيل الخروج
function logout() {
  fetch('/logout', { method: 'POST' })
    .then(() => window.location.href = '/login.html')
    .catch(() => window.location.href = '/login.html');
}

// تحميل البيانات عند فتح الصفحة
document.addEventListener('DOMContentLoaded', function() {
  fetch('/api/current-user')
    .then(r => {
      if (!r.ok) throw new Error('Not logged in');
      return r.json();
    })
    .then(user => {
      if (user) loadProfile();
      else window.location.href = '/login.html';
    })
    .catch(() => window.location.href = '/login.html');
});
