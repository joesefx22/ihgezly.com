// 🆕 نظام إلغاء الحجز مع التأكيد المتعدد
function cancelCurrentBooking() {
  if (currentBookings.length === 0) return;
  
  currentCancellationBooking = currentBookings[0];
  const bookingDate = new Date(currentCancellationBooking.date);
  const now = new Date();
  const hoursDiff = (bookingDate - now) / (1000 * 60 * 60);
  
  // تحديد سياسة الإلغاء
  let policyText = '';
  if (hoursDiff > 48) {
    policyText = 'سيتم استرداد كامل المبلغ المدفوع + كود تعويض صالح لمدة 14 يوم.';
  } else if (hoursDiff > 24) {
    policyText = 'سيتم إصدار كود تعويض صالح لمدة 14 يوم (بدون استرداد نقدي).';
  } else {
    policyText = 'لا يمكن استرداد المبلغ أو إصدار كود تعويض للإلغاء في وقت متأخر.';
  }
  
  document.getElementById('cancellationPolicy').textContent = policyText;
  document.getElementById('finalCancellationInfo').textContent = policyText;
  
  // إعادة تعيين الخطوات
  cancellationStep = 1;
  resetCancellationSteps();
  
  const cancelModal = new bootstrap.Modal(document.getElementById('cancelBookingModal'));
  cancelModal.show();
}

function nextCancellationStep() {
  const currentStep = document.getElementById(`step${cancellationStep}`);
  const nextStep = document.getElementById(`step${cancellationStep + 1}`);
  
  // التحقق من صحة الخطوة الحالية
  if (cancellationStep === 1 && !document.getElementById('confirmCancellation').checked) {
    alert('يرجى تأكيد رغبتك في الإلغاء');
    return;
  }
  
  if (cancellationStep === 2 && !document.getElementById('cancellationReason').value) {
    alert('يرجى اختيار سبب الإلغاء');
    return;
  }
  
  if (currentStep && nextStep) {
    currentStep.classList.remove('active');
    currentStep.style.display = 'none';
    nextStep.classList.add('active');
    nextStep.style.display = 'block';
    cancellationStep++;
  }
  
  // تحديث الأزرار
  if (cancellationStep === 3) {
    document.getElementById('nextCancellationStep').style.display = 'none';
    document.getElementById('confirmCancellationBtn').style.display = 'block';
  }
}

function resetCancellationSteps() {
  for (let i = 1; i <= 3; i++) {
    const step = document.getElementById(`step${i}`);
    step.classList.remove('active');
    step.style.display = i === 1 ? 'block' : 'none';
    if (i === 1) step.classList.add('active');
  }
  
  document.getElementById('nextCancellationStep').style.display = 'block';
  document.getElementById('confirmCancellationBtn').style.display = 'none';
  
  // إعادة تعيين المدخلات
  document.getElementById('confirmCancellation').checked = false;
  document.getElementById('cancellationReason').value = '';
  document.getElementById('otherReason').style.display = 'none';
  document.getElementById('finalConfirm').checked = false;
}

async function confirmCancellation() {
  if (!document.getElementById('finalConfirm').checked) {
    alert('يرجى الموافقة على سياسة الإلغاء');
    return;
  }

  const reason = document.getElementById('cancellationReason').value === 'آخر' ? 
                document.getElementById('otherReason').value : 
                document.getElementById('cancellationReason').value;

  try {
    const response = await fetch(`/api/bookings/${currentCancellationBooking.id}/cancel`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': document.getElementById('csrfToken').value
      },
      body: JSON.stringify({
        cancellationReason: reason
      })
    });

    const result = await response.json();

    if (response.ok) {
      alert('✅ ' + result.message);
      
      // إخفاء شريط المتابعة
      document.getElementById('bookingTracker').style.display = 'none';
      
      // إغلاق المودال
      bootstrap.Modal.getInstance(document.getElementById('cancelBookingModal')).hide();
      
      // إعادة تحميل البيانات
      loadCurrentBookings();
    } else {
      alert('❌ ' + result.message);
    }
  } catch (error) {
    console.error('Cancellation error:', error);
    alert('❌ حدث خطأ أثناء إلغاء الحجز');
  }
}