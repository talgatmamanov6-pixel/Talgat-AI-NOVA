package kz.talgat.nova;

import android.accessibilityservice.AccessibilityService;
import android.graphics.Bitmap;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.view.MotionEvent;
import org.json.JSONArray;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class PhoneSmokeTest {
 private String evaluate(ActivityScenario<MainActivity> scenario,String script) throws Exception {
  CountDownLatch latch=new CountDownLatch(1); AtomicReference<String> result=new AtomicReference<>();
  scenario.onActivity(a -> { WebView web=a.getWindow().getDecorView().findViewWithTag("TalgatWebView"); web.evaluateJavascript(script,value -> { result.set(value); latch.countDown(); }); });
  assertTrue("WebView callback",latch.await(8,TimeUnit.SECONDS)); return result.get();
 }
 private void awaitJs(ActivityScenario<MainActivity> scenario,String script) throws Exception {
  long until=System.currentTimeMillis()+60000;
  while(System.currentTimeMillis()<until) { if("true".equals(evaluate(scenario,script))) return; Thread.sleep(500); }
  fail("Condition failed: "+script);
 }
 private void tap(ActivityScenario<MainActivity> scenario,String id) throws Exception {
  evaluate(scenario,"document.getElementById('"+id+"').scrollIntoView({block:'center'});true");
  JSONArray rect=new JSONArray(evaluate(scenario,"(function(){var r=document.getElementById('"+id+"').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2,innerWidth];})()"));
  float[] point=new float[2];
  scenario.onActivity(a -> { WebView web=a.getWindow().getDecorView().findViewWithTag("TalgatWebView"); int[] position=new int[2]; web.getLocationOnScreen(position); float scale=(float)(web.getWidth()/rect.optDouble(2)); point[0]=position[0]+(float)rect.optDouble(0)*scale; point[1]=position[1]+(float)rect.optDouble(1)*scale; });
  long now=SystemClock.uptimeMillis();
  InstrumentationRegistry.getInstrumentation().sendPointerSync(MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,point[0],point[1],0));
  InstrumentationRegistry.getInstrumentation().sendPointerSync(MotionEvent.obtain(now,now+60,MotionEvent.ACTION_UP,point[0],point[1],0));
 }
 private boolean clickSave(AccessibilityNodeInfo node) {
  if(node==null) return false;
  String text=node.getText()==null?"":node.getText().toString();
  if(node.isClickable() && node.isEnabled() && text.equalsIgnoreCase("save")) return node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
  for(int i=0;i<node.getChildCount();i++) if(clickSave(node.getChild(i))) return true;
  return false;
 }
 private String savedContents() throws Exception {
  try(ParcelFileDescriptor fd=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("cat /sdcard/Download/talgat-test.txt");java.io.InputStream input=new ParcelFileDescriptor.AutoCloseInputStream(fd)) {
   java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] bytes=new byte[512];int count;while((count=input.read(bytes))!=-1)out.write(bytes,0,count);return out.toString("UTF-8");
  }
 }
 private boolean documentsUi() {
  AccessibilityNodeInfo root=InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
  return root!=null && root.getPackageName()!=null && root.getPackageName().toString().contains("documentsui");
 }
 private void awaitPicker() throws Exception {
  for(int i=0;i<40;i++) { if(documentsUi()) return; Thread.sleep(250); }
  fail("Android system document picker did not open");
 }
 private void screenshot(String name) throws Exception {
  Bitmap image=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
  android.content.ContentResolver resolver=InstrumentationRegistry.getInstrumentation().getTargetContext().getContentResolver();
  android.content.ContentValues values=new android.content.ContentValues();
  values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME,name+".png");
  values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE,"image/png");
  values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH,"Download/talgat-proof");
  android.net.Uri uri=resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);
  assertNotNull(uri);
  try(java.io.OutputStream out=resolver.openOutputStream(uri)) { assertNotNull(out); image.compress(Bitmap.CompressFormat.PNG,100,out); }
 }
 @Test public void realSiteVoiceUploadAndDownloads() throws Exception {
  InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission("ai.talgat.studio","android.permission.RECORD_AUDIO");
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
   awaitJs(scenario,"Boolean(document.getElementById('creative-open') && window.__talgatAndroidDownloads)");
   evaluate(scenario,"document.getElementById('creative-open').click();true");
   awaitJs(scenario,"document.getElementById('creative').open"); screenshot("studio-android");
   evaluate(scenario,"document.getElementById('creative').close();navigator.mediaDevices.getUserMedia({audio:true}).then(s=>{s.getTracks().forEach(t=>t.stop());window.__micPassed=true;}).catch(e=>{window.__micFailure=e.name;});true");
   awaitJs(scenario,"Boolean(window.__micPassed || window.__micFailure)");
   assertEquals("Microphone failure: "+evaluate(scenario,"window.__micFailure"),"true",evaluate(scenario,"window.__micPassed===true"));
   // Detached anchors are how ZIP/Word/Excel exports are created in the app.
   evaluate(scenario,"(function(){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['Talgat Android export'],{type:'text/plain'}));a.download='talgat-test.txt';a.click();return true;})()");
   awaitPicker(); screenshot("native-save-picker");
   boolean clicked=false;for(int i=0;i<20 && !clicked;i++){clicked=clickSave(InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow());if(!clicked)Thread.sleep(250);}
   assertTrue("System Save button",clicked);
   String actual="";for(int i=0;i<30;i++){actual=savedContents();if(actual.equals("Talgat Android export"))break;Thread.sleep(300);}
   assertEquals("Talgat Android export",actual);
   tap(scenario,"attach");
   awaitPicker(); screenshot("native-upload-picker");
   InstrumentationRegistry.getInstrumentation().getUiAutomation().performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK);
   Thread.sleep(1000);
   awaitJs(scenario,"location.origin==='https://talgat-ai.netlify.app'");
  }
 }
}
