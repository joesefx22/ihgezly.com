// 🆕 نظام الحجز المطور
async function bookPitch(pitchId) {
  const pitch = pitches.find(p => p.id === pitchId);
  
  // التحقق من اختيار التاريخ والوقت
  const daySelector = document.querySelector(`[data-pitch-id="${pitchId}"] .day-select`);
  const selectedTime = document.querySelector(`[data-pitch-id="${pitchId}"] .time-slot.selected`);
  
  if (!daySelector || !daySelector.value) {
    alert('يرجى اختيار تاريخ الحجز أولاً');
    return;
  }

  if (!selectedTime) {
    alert('يرجى اختيار وقت الحجز أولاً');
    return;
  }

  // تعبئة بيانات الحجز
  document.getElementById('pitchId').value = pitchId;
  document.getElementById('selectedTime').value = selectedTime.dataset.hour;
  document.getElementById('selectedDate').value = daySelector.value;
  
  // تحديث تفاصيل الحجز في المودال
  document.getElementById('bookingDetails').innerHTML = `
    <div class="alert alert-success">
      <h6>تفاصيل الحجز:</h6>
      <p class="mb-1"><strong>الملعب:</strong> ${pitch.name}</p>
      <p class="mb-1"><strong>الموقع:</strong> ${pitch.location}</p>
      <p class="mb-1"><strong>التاريخ:</strong> ${daySelector.value}</p>
      <p class="mb-1"><strong>الوقت:</strong> ${formatTime(parseInt(selectedTime.dataset.hour))}</p>
      <p class="mb-1"><strong>السعر الكامل:</strong> ${pitch.price} جنيه</p>
      <p class="mb-1"><strong>العربون المطلوب:</strong> ${pitch.deposit} جنيه</p>
      <p class="mb-0"><strong>المبلغ المتبقي:</strong> ${pitch.price - pitch.deposit} جنيه</p>
    </div>
  `;

  // حفظ بيانات الحجز مؤقتاً
  const pendingBooking = {
    pitchId: pitchId,
    pitchName: pitch.name,
    date: daySelector.value,
    time: selectedTime.dataset.hour,
    amount: pitch.price,
    deposit: pitch.deposit
  };
  sessionStorage.setItem('pendingBooking', JSON.stringify(pendingBooking));

  // عرض مودال الحجز
  const bookingModal = new bootstrap.Modal(document.getElementById('bookingModal'));
  bookingModal.show();
}

// 🆕 تحميل الحجوزات الحالية للمستخدم
async function loadCurrentBookings() {
  try {
    const response = await fetch('/api/user/bookings');
    if (response.ok) {
      const bookings = await response.json();
      currentBookings = bookings.filter(b => 
        b.status === 'confirmed' && 
        new Date(b.date) > new Date()
      );
      
      if (currentBookings.length > 0) {
        showBookingTracker(currentBookings[0]);
      }
    }
  } catch (error) {
    console.error('Error loading bookings:', error);
  }
}

// 🆕 عرض شريط متابعة الحجز
function showBookingTracker(booking) {
  const tracker = document.getElementById('bookingTracker');
  const progress = document.getElementById('trackerProgress');
  
  document.getElementById('trackerTitle').textContent = `متابعة حجز: ${booking.pitchName}`;
  document.getElementById('trackerDetails').textContent = 
    `الملعب: ${booking.pitchName} | التاريخ: ${booking.date} | الوقت: ${booking.time}`;
  
  // حساب التقدم
  const now = new Date();
  const bookingDate = new Date(booking.date);
  const totalTime = bookingDate - new Date(booking.createdAt);
  const elapsedTime = now - new Date(booking.createdAt);
  const progressPercent = Math.min((elapsedTime / totalTime) * 100, 100);
  
  progress.style.width = `${progressPercent}%`;
  
  // تحديث الحالة
  const timeLeft = bookingDate - now;
  const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
  
  if (hoursLeft > 48) {
    document.getElementById('trackerStatus').textContent = `متبقي ${hoursLeft} ساعة للحجز - المبلغ المتبقي: ${booking.remainingAmount} جنيه`;
  } else if (hoursLeft > 0) {
    document.getElementById('trackerStatus').textContent = `متبقي ${hoursLeft} ساعة للحجز - يرجى دفع المبلغ المتبقي`;
  } else {
    document.getElementById('trackerStatus').textContent = 'تم انتهاء وقت الحجز';
  }
  
  tracker.style.display = 'block';
}

// إرسال نموذج الحجز
document.getElementById('bookingForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const formData = new FormData(this);
  const data = Object.fromEntries(formData);
  
  try {
    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': document.getElementById('csrfToken').value
      },
      body: JSON.stringify({
        pitchId: data.pitchId,
        date: data.selectedDate,
        time: data.selectedTime,
        name: data.name,
        phone: data.phone,
        email: data.email,
        discountCode: data.discountCode
      })
    });

    const result = await response.json();

    if (response.ok) {
      document.getElementById('bookingStatus').innerHTML = `
        <div class="alert alert-success">
          <i class="bi bi-check-circle me-2"></i>${result.message}
        </div>
      `;
      
      // تحديث الواجهة وإعادة التوجيه
      setTimeout(() => {
        bootstrap.Modal.getInstance(document.getElementById('bookingModal')).hide();
        window.location.href = '/payment';
      }, 2000);
    } else {
      document.getElementById('bookingStatus').innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle me-2"></i>${result.message}
        </div>
      `;
    }
  } catch (error) {
    document.getElementById('bookingStatus').innerHTML = `
      <div class="alert alert-danger">
        <i class="bi bi-exclamation-triangle me-2"></i>حدث خطأ في الاتصال بالخادم
      </div>
    `;
  }
});