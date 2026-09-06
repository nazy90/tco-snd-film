// Shared by both the crew and guest forms.
// The page declares which it is via <body data-form-type="crew|guest">.

const SHEET_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzrCFEdChGLsRMax_ZEssl-rq-ulYpZWGEKpZRyj6ZSnypDTzSMe803DKhGuk8p1sBz/exec";
const MAX_FILE_MB = 8;
const PROJECT_NAME = "T&Co SND Film";

const formType = document.body.dataset.formType || 'crew';
const crewForm = document.getElementById('crewForm');
const thankYou = document.getElementById('thankYou');
const heroSection = document.querySelector('.hero');
const submitButton = document.getElementById('submitButton');

/* ---------- conditional fields ---------- */

// Both forms share this helper; a form that lacks the pair is simply skipped.
function toggle(selectId, fieldId){
  const select = document.getElementById(selectId);
  const field = document.getElementById(fieldId);
  if (!select || !field) return;
  const update = () => field.classList.toggle('hidden', select.value !== 'نعم');
  select.addEventListener('change', update);
  update();
}

toggle('hasCar','plateField');
toggle('hasCar','carTypeField');
toggle('isHead','teamCountField');

const hasCar = document.getElementById('hasCar');
const isHead = document.getElementById('isHead');

function setRequired(name, required){
  const input = crewForm.querySelector(`[name="${name}"]`);
  if (input) input.required = required;
}

function updateRequired(){
  const carRequired = hasCar && hasCar.value === 'نعم';
  setRequired('plate_number', carRequired);
  setRequired('car_type', carRequired);
  setRequired('team_count', !!isHead && isHead.value === 'نعم');
}

if (hasCar) hasCar.addEventListener('change', updateRequired);
if (isHead) isHead.addEventListener('change', updateRequired);
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
  crewForm.classList.add('hidden');
  thankYou.classList.add('show');
  window.scrollTo({top:0, behavior:'smooth'});
  thankYou.focus();
}

function showForm(){
  thankYou.classList.remove('show');
  heroSection.classList.remove('hidden');
  crewForm.classList.remove('hidden');
  window.scrollTo({top:0, behavior:'smooth'});
}

document.getElementById('newEntryButton').addEventListener('click', showForm);

// The browser's own "Please select a file." follows the browser's language,
// not the page's, so force an Arabic message on this required field.
const documentFileInput = crewForm.querySelector('input[name="document_file"]');
documentFileInput.addEventListener('invalid', () => {
  documentFileInput.setCustomValidity('يرجى إرفاق صورة الهوية أو جواز السفر.');
});
documentFileInput.addEventListener('change', () => documentFileInput.setCustomValidity(''));

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

async function collectData(form){
  const checkedDays = [...form.querySelectorAll('input[name="days"]:checked')].map(x => x.value);
  if (!checkedDays.length){
    throw new Error('يرجى اختيار يوم واحد على الأقل.');
  }

  const fd = new FormData(form);
  const data = {};
  for (const [key,value] of fd.entries()){
    if (key !== 'document_file' && key !== 'days' && !key.startsWith('consent_')) data[key] = value;
  }

  data.days = checkedDays.join('، ');

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

  data.consent_accuracy = 'موافق';
  data.consent_confidentiality = 'موافق';
  data.consent_no_photography = 'موافق';
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

crewForm.addEventListener('reset', function(){
  setTimeout(() => {
    updateRequired();
    document.getElementById('formMessage').className = 'message';
  });
});

crewForm.addEventListener('submit', async function(e){
  e.preventDefault();

  try{
    submitButton.disabled = true;
    submitButton.textContent = 'جار التحضير...';
    const data = await collectData(this);
    submitButton.textContent = data.document_file_data ? 'جار رفع المرفق...' : 'جار الإرسال...';

    await sendToSheet(data);
    this.reset();
    updateRequired();
    showThanks();
  } catch(error){
    showMessage('error', error.message || 'تعذر إرسال البيانات. يرجى المحاولة مرة أخرى.');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'إرسال البيانات';
  }
});
