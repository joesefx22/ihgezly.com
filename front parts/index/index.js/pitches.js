// 🆕 تحميل بيانات الملاعب مع التوفر
async function loadPitchesData() {
  try {
    const response = await fetch('/api/pitches');
    pitches = await response.json();
    
    // تحميل بيانات التوفر لكل ملعب
    for (let pitch of pitches) {
      await loadPitchAvailability(pitch.id);
    }
    
    loadPitches(pitches);
    loadCurrentBookings();
  } catch (error) {
    console.error('Error loading pitches:', error);
    pitches = getDefaultPitches();
    loadPitches(pitches);
  }
}

// 🆕 تحميل بيانات التوفر للملعب
async function loadPitchAvailability(pitchId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await fetch(`/api/pitches/${pitchId}/available-slots?date=${today}&period=all`);
    const data = await response.json();
    
    const pitch = pitches.find(p => p.id === pitchId);
    if (pitch) {
      pitch.availability = data.availableCount;
      pitch.totalSlots = data.totalSlots;
      pitch.availabilityPercentage = (data.availableCount / data.totalSlots) * 100;
    }
  } catch (error) {
    console.error('Error loading availability:', error);
  }
}

// 🆕 إنشاء قائمة الأيام للاختيار
function createDaySelector(pitchId) {
  const daysContainer = document.createElement('div');
  daysContainer.className = 'days-selector';
  
  const days = [];
  const today = new Date();
  const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  
  // إنشاء الأيام السبعة القادمة
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(today.getDate() + i);
    
    days.push({
      date: date.toISOString().split('T')[0],
      dayName: dayNames[date.getDay()],
      dayNumber: date.getDate(),
      month: monthNames[date.getMonth()],
      isToday: i === 0
    });
  }
  
  daysContainer.innerHTML = `
    <label class="form-label">اختر يوم الحجز:</label>
    <select class="form-select day-select" onchange="loadPitchSlots(${pitchId}, this.value)">
      <option value="">اختر اليوم</option>
      ${days.map(day => `
        <option value="${day.date}">
          ${day.isToday ? 'انهرده' : day.dayName} - ${day.dayNumber} ${day.month}
        </option>
      `).join('')}
    </select>
  `;
  
  return daysContainer;
}

// 🆕 تحديث تحميل وعرض الملاعب
function loadPitches(pitchesData) {
  const container = document.getElementById('pitchesContainer');
  container.innerHTML = '';

  if (pitchesData.length === 0) {
    container.innerHTML = `
      <div class="col-12 text-center">
        <div class="alert alert-info">
          <i class="bi bi-info-circle me-2"></i>
          لا توجد ملاعب متاحة حسب معايير البحث المحددة
        </div>
      </div>
    `;
    return;
  }

  pitchesData.forEach(pitch => {
    const col = document.createElement('div');
    col.className = 'col-lg-4 col-md-6 fade-in';
    col.setAttribute('data-pitch-id', pitch.id);
    
    // تحديد لون شارة التوفر
    let availabilityClass = 'availability-high';
    if (pitch.availabilityPercentage < 30) {
      availabilityClass = 'availability-low';
    } else if (pitch.availabilityPercentage < 60) {
      availabilityClass = 'availability-medium';
    }
    
    col.innerHTML = `
      <div class="pitch-card">
        <div class="pitch-image" style="background-image: url('${pitch.image}')">
          <span class="pitch-badge ${availabilityClass}">
            ${pitch.availability || 0}/${pitch.totalSlots || 10} متاح
          </span>
          <span class="pitch-price">${pitch.price} ج.م/ساعة</span>
          <span class="pitch-deposit">
            العربون: ${pitch.deposit} ج.م
          </span>
        </div>
        <div class="pitch-info">
          <h4 class="pitch-title">${pitch.name}</h4>
          <p class="pitch-location">
            <i class="bi bi-geo-alt"></i> ${pitch.location}
          </p>
          <div class="pitch-features">
            ${pitch.features.slice(0, 3).map(feature => `
              <span class="feature">
                <i class="bi bi-check-circle"></i> ${feature}
              </span>
            `).join('')}
          </div>
          
          <!-- اختيار اليوم من القائمة المنسدلة -->
          <div class="day-selector-container" id="day-selector-${pitch.id}">
            <!-- سيتم تعبئة الأيام هنا -->
          </div>
          
          <div class="d-flex justify-content-between align-items-center mb-3">
            <div>
              <div class="rating-stars">
                ${generateStarRating(pitch.rating)}
              </div>
              <div class="rating-text">
                ${pitch.rating.toFixed(1)} (${pitch.totalRatings} تقييم)
              </div>
            </div>
            <div>
              <a href="${pitch.googleMaps}" target="_blank" class="btn btn-outline-primary btn-sm me-2">
                <i class="bi bi-geo-alt me-1"></i>اتجاهات
              </a>
              <button class="btn btn-outline-warning btn-sm" onclick="ratePitch(${pitch.id})">
                <i class="bi bi-star me-1"></i>قيم
              </button>
            </div>
          </div>
          
          <!-- الأوقات المتاحة -->
          <div class="time-slots-container" id="slots-${pitch.id}">
            <p class="text-muted text-center">اختر يوماً لعرض الأوقات المتاحة</p>
          </div>
          
          <button class="btn btn-primary w-100 mt-3" onclick="bookPitch(${pitch.id})">
            <i class="bi bi-credit-card me-2"></i>احجز وادفع العربون
          </button>
        </div>
      </div>
    `;
    
    container.appendChild(col);
    
    // تعبئة قائمة الأيام بعد إضافة العنصر للـDOM
    setTimeout(() => {
      const daySelectorContainer = document.getElementById(`day-selector-${pitch.id}`);
      if (daySelectorContainer) {
        daySelectorContainer.appendChild(createDaySelector(pitch.id));
      }
    }, 100);
  });
}

// 🆕 تحميل الأوقات المتاحة للملعب
async function loadPitchSlots(pitchId, date) {
  try {
    const response = await fetch(`/api/pitches/${pitchId}/available-slots?date=${date}&period=all`);
    const data = await response.json();
    
    const slotsContainer = document.getElementById(`slots-${pitchId}`);
    slotsContainer.innerHTML = '';
    
    if (data.availableSlots.length === 0) {
      slotsContainer.innerHTML = '<p class="text-danger text-center">لا توجد أوقات متاحة في هذا التاريخ</p>';
      return;
    }
    
    data.availableSlots.forEach(hour => {
      const slotElement = document.createElement('div');
      slotElement.className = 'time-slot available';
      slotElement.textContent = formatTime(hour);
      slotElement.dataset.hour = hour;
      slotElement.onclick = () => selectTimeSlot(slotElement, pitchId, hour);
      slotsContainer.appendChild(slotElement);
    });
    
  } catch (error) {
    console.error('Error loading slots:', error);
    const slotsContainer = document.getElementById(`slots-${pitchId}`);
    slotsContainer.innerHTML = '<p class="text-danger text-center">حدث خطأ في تحميل الأوقات</p>';
  }
}

// 🆕 فلترة الملاعب
function filterPitches() {
  const area = document.getElementById('areaFilter').value;
  const sort = document.getElementById('sortFilter').value;
  const type = document.getElementById('typeFilter').value;

  let filteredPitches = [...pitches];

  // التصفية حسب المنطقة
  if (area) {
    filteredPitches = filteredPitches.filter(pitch => pitch.area === area);
  }

  // التصفية حسب النوع
  if (type) {
    filteredPitches = filteredPitches.filter(pitch => pitch.type === type);
  }

  // الترتيب
  if (sort === 'price_low') {
    filteredPitches.sort((a, b) => a.price - b.price);
  } else if (sort === 'price_high') {
    filteredPitches.sort((a, b) => b.price - a.price);
  } else if (sort === 'rating') {
    filteredPitches.sort((a, b) => b.rating - a.rating);
  } else if (sort === 'availability') {
    filteredPitches.sort((a, b) => (b.availabilityPercentage || 0) - (a.availabilityPercentage || 0));
  }

  loadPitches(filteredPitches);
}