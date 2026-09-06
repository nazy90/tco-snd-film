// Shared by the crew and guest forms.
// The page declares which it is via <body data-form-type="crew|guest">.
//
// The two forms have genuinely different shapes — crew collects documents and
// participation days, guests collect arrival and catering preferences — so every
// section below is feature-detected rather than assumed present.

const SHEET_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzcD6eVBQ0U0YpnAwYIrrppVShwe1ZECADP8zcTUbJRAMtaDQ--FMZ18ZEhhKSdS_Wn/exec";
const MAX_FILE_MB = 8;
const PROJECT_NAME = "T&Co SND Film";

const formType = document.body.dataset.formType || 'crew';
const form = document.getElementById('crewForm');
const thankYou = document.getElementById('thankYou');
const heroSection = document.querySelector('.hero');
const submitButton = document.getElementById('submitButton');

const fileInput = form.querySelector('input[type="file"]');
const dayBoxes = form.querySelectorAll('input[name="days"]');
const consentBoxes = form.querySelectorAll('input[name^="consent_"]');

/* ---------- conditional fields ---------- */

function fieldById(id){ return document.getElementById(id); }

function setShown(id, shown){
  const field = fieldById(id);
  if (field) field.classList.toggle('hidden', !shown);
}

function setRequired(name, required){
  const input = form.querySelector(`[name="${name}"]`);
  if (input) input.required = required;
}

// Crew: a "نعم/لا" select reveals its dependent field.
function bindSelectToggle(selectId, fieldIds){
  const select = document.getElementById(selectId);
  if (!select) return null;
  const update = () => fieldIds.forEach(id => setShown(id, select.value === 'نعم'));
  select.addEventListener('change', () => { update(); updateRequired(); });
  update();
  return select;
}

const hasCar = bindSelectToggle('hasCar', ['plateField','carTypeField']);
const isHead = bindSelectToggle('isHead', ['teamCountField']);

// Guests: an arrival radio group reveals either pickup or own-car fields.
const arrivalRadios = [...form.querySelectorAll('input[name="arrival"]')];

function arrivalValue(){
  const picked = arrivalRadios.find(r => r.checked);
  return picked ? picked.value : '';
}

function updateArrival(){
  if (!arrivalRadios.length) return;
  const value = arrivalValue();
  setShown('pickupLocationField', value === 'Pick-up');
  setShown('plateField', value === 'بسيارتي');
  setShown('carTypeField', value === 'بسيارتي');
}

arrivalRadios.forEach(radio => radio.addEventListener('change', () => {
  updateArrival();
  updateRequired();
}));

function updateRequired(){
  if (hasCar){
    const carRequired = hasCar.value === 'نعم';
    setRequired('plate_number', carRequired);
    setRequired('car_type', carRequired);
  }
  if (isHead) setRequired('team_count', isHead.value === 'نعم');

  if (arrivalRadios.length){
    const value = arrivalValue();
    setRequired('pickup_location', value === 'Pick-up');
    setRequired('plate_number', value === 'بسيارتي');
    setRequired('car_type', value === 'بسيارتي');
  }
}

updateArrival();
updateRequired();

/* ---------- messages and screens ---------- */

function showMessage(type, text){
  const message = document.getElementById('formMessage');
  message.className = `message ${type}`;
  message.textContent = text;
}

function showThanks(){
  showMessage('', '');
  heroSection.classList.add('hidden');
  form.classList.add('hidden');
  thankYou.classList.add('show');
  window.scrollTo({top:0, behavior:'smooth'});
  thankYou.focus();
}

function showForm(){
  thankYou.classList.remove('show');
  heroSection.classList.remove('hidden');
  form.classList.remove('hidden');
  window.scrollTo({top:0, behavior:'smooth'});
}

document.getElementById('newEntryButton').addEventListener('click', showForm);

// The browser's own "Please select a file." follows the browser's language,
// not the page's, so force an Arabic message on this required field.
if (fileInput){
  fileInput.addEventListener('invalid', () => {
    fileInput.setCustomValidity('يرجى إرفاق صورة الهوية أو جواز السفر.');
  });
  fileInput.addEventListener('change', () => fileInput.setCustomValidity(''));
}

/* ---------- collecting and sending ---------- */

function readFileAsBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('تعذر قراءة الملف المرفق. جرّب ملفاً آخر.'));
    reader.readAsDataURL(file);
  });
}

async function collectData(theForm){
  const fd = new FormData(theForm);
  const data = {};
  for (const [key,value] of fd.entries()){
    if (key !== 'document_file' && key !== 'days' && !key.startsWith('consent_')) data[key] = value;
  }

  if (dayBoxes.length){
    const checkedDays = [...theForm.querySelectorAll('input[name="days"]:checked')].map(x => x.value);
    if (!checkedDays.length) throw new Error('يرجى اختيار يوم واحد على الأقل.');
    data.days = checkedDays.join('، ');
  }

  if (fileInput){
    const file = fd.get('document_file');
    data.document_file = '';
    if (file && file.size){
      if (file.size > MAX_FILE_MB * 1024 * 1024){
        throw new Error(`حجم المرفق ${(file.size/1048576).toFixed(1)} ميجابايت، والحد الأقصى ${MAX_FILE_MB} ميجابايت. يرجى ضغط الصورة أو اختيار صورة أصغر.`);
      }
      data.document_file = file.name;
      data.document_file_name = file.name;
      data.document_file_type = file.type || 'application/octet-stream';
      data.document_file_data = await readFileAsBase64(file);
    }
  }

  if (consentBoxes.length){
    data.consent_accuracy = 'موافق';
    data.consent_confidentiality = 'موافق';
    data.consent_no_photography = 'موافق';
  }

  data.submitted_at = new Date().toISOString();
  data.form_type = formType;
  data.source = `${PROJECT_NAME} — ${formType === 'guest' ? 'Guest' : 'Crew'} Form`;
  return data;
}

async function sendToSheet(data){
  let response;
  try{
    response = await fetch(SHEET_WEB_APP_URL, {
      method: 'POST',
      headers: {'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify(data)
    });
  } catch(err){
    throw new Error('تعذر الاتصال بالخادم. تحقق من الاتصال بالإنترنت وحاول مرة أخرى.');
  }

  const raw = await response.text();
  let result;
  try{
    result = JSON.parse(raw);
  } catch(err){
    // An HTML page here means the Apps Script failed or is not deployed correctly.
    throw new Error('لم يتم حفظ البيانات. يرجى إبلاغ مسؤول النموذج (خطأ في السكربت).');
  }

  if (!result.ok){
    throw new Error('لم يتم حفظ البيانات: ' + (result.error || 'خطأ غير معروف.'));
  }
  return result;
}

form.addEventListener('reset', function(){
  setTimeout(() => {
    updateArrival();
    updateRequired();
    document.getElementById('formMessage').className = 'message';
  });
});

form.addEventListener('submit', async function(e){
  e.preventDefault();

  try{
    submitButton.disabled = true;
    submitButton.textContent = 'جار التحضير...';
    const data = await collectData(this);
    submitButton.textContent = data.document_file_data ? 'جار رفع المرفق...' : 'جار الإرسال...';

    await sendToSheet(data);
    this.reset();
    updateArrival();
    updateRequired();
    showThanks();
  } catch(error){
    showMessage('error', error.message || 'تعذر إرسال البيانات. يرجى المحاولة مرة أخرى.');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'إرسال البيانات';
  }
});
