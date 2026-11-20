package kz.talgat.nova;

import android.accessibilityservice.AccessibilityService;
import android.graphics.Bitmap;
import android.os.ParcelFileDescriptor;
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
  File dir=new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null),"proof"); dir.mkdirs();
  try(FileOutputStream out=new FileOutputStream(new File(dir,name+".png"))) { image.compress(Bitmap.CompressFormat.PNG,100,out); }
 }
 @Test public void realSiteVoiceUploadAndDownloads() throws Exception {
  try(ParcelFileDescriptor grant=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("pm grant ai.talgat.studio android.permission.RECORD_AUDIO")) { Thread.sleep(500); }
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
   awaitJs(scenario,"Boolean(document.getElementById('creative-open') && window.__talgatAndroidDownloads)");
   evaluate(scenario,"document.getElementById('creative-open').click();true");
   awaitJs(scenario,"document.getElementById('creative').open"); screenshot("studio-android");
   evaluate(scenario,"document.getElementById('creative').close();navigator.mediaDevices.getUserMedia({audio:true}).then(s=>{s.getTracks().forEach(t=>t.stop());window.__micPassed=true;}).catch(e=>{window.__micFailure=e.name;});true");
   awaitJs(scenario,"window.__micPassed===true");
   // Detached anchors are how ZIP/Word/Excel exports are created in the app.
   evaluate(scenario,"(function(){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['Talgat Android export'],{type:'text/plain'}));a.download='talgat-test.txt';a.click();return true;})()");
   awaitPicker(); screenshot("native-save-picker");
   InstrumentationRegistry.getInstrumentation().getUiAutomation().performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK);
   Thread.sleep(1000);
   evaluate(scenario,"document.getElementById('attach').click();true");
   awaitPicker(); screenshot("native-upload-picker");
   InstrumentationRegistry.getInstrumentation().getUiAutomation().performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK);
   Thread.sleep(1000);
   awaitJs(scenario,"location.origin==='https://talgat-ai.netlify.app'");
  }
 }
}
