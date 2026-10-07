import { supabase, supabaseConfigured } from './supabase-client.js';
import './shared.js';
import { translate, setToast } from './shared.js';

const $ = (id) => document.getElementById(id);
let pendingEmail = '';

function setStatus(message, type='info') {
  const box=$('authStatus'); box.hidden=false; box.textContent=message; box.dataset.type=type;
}
function clearStatus(){ $('authStatus').hidden=true; }
function safeReturnTo(){
  const raw=new URLSearchParams(location.search).get('returnTo');
  return raw && /^[a-zA-Z0-9_-]+\.html(?:\?.*)?$/.test(raw) ? raw : 'analyze.html';
}
async function renderSession(){
  if(!supabaseConfigured || !supabase){
    setStatus(translate('Supabase is not configured yet. Add your project URL and publishable key in config.js.','لم يتم ربط Supabase بعد. أضيفي رابط المشروع والمفتاح العام داخل config.js.'),'warning');
    return;
  }
  const {data}=await supabase.auth.getSession();
  const user=data?.session?.user;
  $('signedOutView').hidden=!!user;
  $('signedInView').hidden=!user;
  if(user) $('signedInEmail').textContent=user.email||'';
}
async function sendOtp(){
  clearStatus();
  if(!supabase){setStatus(translate('Supabase is not configured yet.','لم يتم ربط Supabase بعد.'),'warning');return;}
  pendingEmail=$('authEmail').value.trim().toLowerCase();
  if(!pendingEmail)return;
  const {error}=await supabase.auth.signInWithOtp({email:pendingEmail,options:{shouldCreateUser:true}});
  if(error){setStatus(error.message,'error');return;}
  $('otpEmailLabel').textContent=pendingEmail;
  $('emailForm').hidden=true; $('otpForm').hidden=false; $('authOtp').focus();
  setStatus(translate('Verification code sent. Check your inbox and spam folder.','تم إرسال رمز التحقق. تحققي من البريد الوارد والرسائل غير المرغوب فيها.'),'success');
}
$('emailForm').addEventListener('submit',async(e)=>{e.preventDefault();await sendOtp();});
$('otpForm').addEventListener('submit',async(e)=>{
  e.preventDefault(); clearStatus();
  const token=$('authOtp').value.trim();
  if(!/^\d{6}$/.test(token)){setStatus(translate('Enter the 6-digit code from your email.','أدخلي رمز التحقق المكوّن من 6 أرقام.'),'error');return;}
  const {data,error}=await supabase.auth.verifyOtp({email:pendingEmail,token,type:'email'});
  if(error){setStatus(error.message,'error');return;}
  if(data?.session){setToast(translate('Email verified successfully.','تم تأكيد البريد بنجاح.'),'success');location.href=safeReturnTo();}
});
$('resendOtp').addEventListener('click',()=>{$('emailForm').hidden=false;$('otpForm').hidden=true;$('authOtp').value='';clearStatus();});
$('signOutButton').addEventListener('click',async()=>{if(!supabase)return;await supabase.auth.signOut();setToast(translate('Signed out.','تم تسجيل الخروج.'),'success');await renderSession();});
window.addEventListener('navigate:language',renderSession);
renderSession();
