// 🆕 متغيرات النظام المطور
let pitches = [];
let currentBookings = [];
let currentCancellationBooking = null;
let cancellationStep = 1;
let selectedDate = '';
let selectedPeriod = 'morning';
let selectedPitchId = null;
let selectedTime = '';
let discountCodes = [];

// بيانات افتراضية للملاعب
function getDefaultPitches() {
  return [
    {
      id: 1,
      name: "نادي الطيارة - الملعب الرئيسي",
      location: "المقطم - شارع التسعين",
      area: "mokatam",
      type: "artificial",
      image: "/images/tyara-1.jpg",
      price: 250,
      deposit: 75,
      features: ["نجيلة صناعية", "كشافات ليلية", "غرف تبديل"],
      rating: 4.7,
      totalRatings: 128,
      googleMaps: "https://maps.app.goo.gl/v6tj8pxhG5FHfoSj9"
    },
    {
      id: 2,
      name: "نادي الطيارة - الملعب الثاني",
      location: "المقطم - شارع التسعين",
      area: "mokatam",
      type: "artificial",
      image: "/images/tyara-2.jpg",
      price: 220,
      deposit: 66,
      features: ["نجيلة صناعية", "إضاءة ليلية", "غرف تبديل"],
      rating: 4.5,
      totalRatings: 95,
      googleMaps: "https://maps.app.goo.gl/v6tj8pxhG5FHfoSj9"
    },
    {
      id: 3,
      name: "الراعي الصالح",
      location: "المقطم - شارع 9",
      area: "mokatam",
      type: "natural",
      image: "/images/raei.jpg",
      price: 300,
      deposit: 90,
      features: ["نجيلة طبيعية", "مقاعد جماهير", "كافيتريا"],
      rating: 4.8,
      totalRatings: 156,
      googleMaps: "https://maps.app.goo.gl/hUUReW3ZDQM9wwEj7"
    }
  ];
}