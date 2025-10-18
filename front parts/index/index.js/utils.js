// توليد نجوم التقييم
function generateStarRating(rating) {
  let stars = '';
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  
  for (let i = 1; i <= 5; i++) {
    if (i <= fullStars) {
      stars += '<i class="bi bi-star-fill text-warning"></i>';
    } else if (i === fullStars + 1 && hasHalfStar) {
      stars += '<i class="bi bi-star-half text-warning"></i>';
    } else {
      stars += '<i class="bi bi-star text-warning"></i>';
    }
  }
  
  return stars;
}

// تحويل الساعة إلى نص عربي
function formatTime(hour) {
  if (hour === 0) return '12 منتصف الليل';
  if (hour < 12) return `${hour} صباحاً`;
  if (hour === 12) return '12 ظهراً';
  if (hour <= 16) return `${hour - 12} عصراً`;
  if (hour <= 23) return `${hour - 12} مساءً`;
  return `${hour - 12} منتصف الليل`;
}

function selectTimeSlot(element, pitchId, hour) {
  // إلغاء تحديد جميع الأوقات في هذه البطاقة
  const card = element.closest('.pitch-card');
  card.querySelectorAll('.time-slot').forEach(slot => {
    slot.classList.remove('selected');
  });
  
  // تحديد الوقت المختار
  element.classList.add('selected');
  selectedPitchId = pitchId;
  selectedTime = hour;
}

function viewBookingDetails() {
  if (currentBookings.length > 0) {
    alert(`تفاصيل الحجز:\nالملعب: ${currentBookings[0].pitchName}\nالتاريخ: ${currentBookings[0].date}\nالوقت: ${currentBookings[0].time}\nالمبلغ المتبقي: ${currentBookings[0].remainingAmount} جنيه`);
  }
}