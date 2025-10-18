function ratePitch(pitchId) {
  const pitch = pitches.find(p => p.id === pitchId);
  
  document.getElementById('ratingPitchId').value = pitchId;
  document.getElementById('ratingDetails').innerHTML = `
    <div class="alert alert-warning">
      <h6>تقييم: ${pitch.name}</h6>
      <p class="mb-0">شاركنا تجربتك في هذا الملعب</p>
    </div>
  `;
  
  // إعادة تعيين النجوم
  document.querySelectorAll('#ratingStars .star').forEach(star => {
    star.classList.remove('active');
    star.classList.remove('bi-star-fill');
    star.classList.add('bi-star');
  });
  
  document.getElementById('selectedRating').value = '';
  document.getElementById('ratingComment').value = '';
  
  // إعداد أحداث النجوم
  document.querySelectorAll('#ratingStars .star').forEach(star => {
    star.addEventListener('click', function() {
      const rating = parseInt(this.dataset.rating);
      document.getElementById('selectedRating').value = rating;
      
      // تحديث مظهر النجوم
      document.querySelectorAll('#ratingStars .star').forEach(s => {
        const starRating = parseInt(s.dataset.rating);
        if (starRating <= rating) {
          s.classList.add('active', 'bi-star-fill');
          s.classList.remove('bi-star');
        } else {
          s.classList.remove('active', 'bi-star-fill');
          s.classList.add('bi-star');
        }
      });
    });
  });
  
  const ratingModal = new bootstrap.Modal(document.getElementById('ratingModal'));
  ratingModal.show();
}

// إرسال نموذج التقييم
document.getElementById('ratingForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const formData = new FormData(this);
  const data = Object.fromEntries(formData);
  
  try {
    const response = await fetch('/api/ratings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': document.getElementById('ratingCsrfToken').value
      },
      body: JSON.stringify({
        pitchId: data.pitchId,
        rating: data.rating,
        comment: data.comment,
        bookingId: data.bookingId
      })
    });

    const result = await response.json();

    if (response.ok) {
      document.getElementById('ratingStatus').innerHTML = `
        <div class="alert alert-success">
          <i class="bi bi-check-circle me-2"></i>${result.message}
        </div>
      `;
      
      // تحديث الواجهة وإغلاق النافذة
      setTimeout(() => {
        bootstrap.Modal.getInstance(document.getElementById('ratingModal')).hide();
        // إعادة تحميل بيانات الملاعب لتحديث التقييمات
        loadPitchesData();
      }, 2000);
    } else {
      document.getElementById('ratingStatus').innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle me-2"></i>${result.message}
        </div>
      `;
    }
  } catch (error) {
    document.getElementById('ratingStatus').innerHTML = `
      <div class="alert alert-danger">
        <i class="bi bi-exclamation-triangle me-2"></i>حدث خطأ في الاتصال بالخادم
      </div>
    `;
  }
});