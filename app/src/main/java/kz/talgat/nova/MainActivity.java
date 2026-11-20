package kz.talgat.nova;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.*;
import android.widget.*;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
 private WebView web;
 private LinearLayout root;
 private TextView status;
 private ValueCallback<Uri[]> fileCallback;
 private PermissionRequest audioRequest;
 private byte[] pendingDownload;
 private final ExecutorService fileWriter = Executors.newSingleThreadExecutor();
 private boolean destroyed;
 private static final int FILE_PICKER = 1201, AUDIO_PERMISSION = 1202, SAVE_FILE = 1203;

 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
  getWindow().setStatusBarColor(Color.rgb(9,16,28));
  getWindow().setNavigationBarColor(Color.rgb(9,16,28));
  root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
  root.setBackgroundColor(Color.rgb(9,16,28));
  LinearLayout toolbar = new LinearLayout(this); toolbar.setGravity(android.view.Gravity.CENTER_VERTICAL);
  TextView title = new TextView(this); title.setText("TALGAT AI"); title.setTextColor(Color.WHITE); title.setTextSize(18); title.setPadding(dp(16),0,0,0);
  toolbar.addView(title,new LinearLayout.LayoutParams(0,dp(52),1)); title.setGravity(android.view.Gravity.CENTER_VERTICAL);
  Button refresh = new Button(this); refresh.setText("↻"); refresh.setContentDescription("Обновить приложение"); refresh.setTextSize(24);
  refresh.setOnClickListener(v -> web.loadUrl(NativePolicy.SITE)); toolbar.addView(refresh,new LinearLayout.LayoutParams(dp(52),dp(52)));
  Button menu = new Button(this); menu.setText("⋮"); menu.setTextSize(24); menu.setContentDescription("Меню приложения");
  menu.setOnClickListener(v -> new AlertDialog.Builder(this).setTitle("Talgat AI 2.1")
   .setItems(new String[]{"Открыть в браузере","О приложении"},(d,which) -> {
    if(which==0) openExternal(Uri.parse(NativePolicy.SITE));
    else new AlertDialog.Builder(this).setTitle("Talgat AI")
     .setMessage("Голос, изображения, дизайн, код и анализ.\nОтветы и генерация работают через интернет.\nМикрофон используется после вашего разрешения. Файлы выбираете и сохраняете вы.")
     .setPositiveButton("Понятно",null).show();
   }).show());
  toolbar.addView(menu,new LinearLayout.LayoutParams(dp(52),dp(52))); root.addView(toolbar);
  status = new TextView(this); status.setTextColor(Color.rgb(113,230,241)); status.setPadding(dp(16),dp(8),dp(16),dp(8));
  status.setText("Подключаю Talgat AI…"); root.addView(status);
  web = new WebView(this); web.setTag("TalgatWebView"); web.setBackgroundColor(Color.rgb(9,16,28));
  WebSettings settings = web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
  settings.setAllowFileAccess(false); settings.setAllowContentAccess(true);
  settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  settings.setMediaPlaybackRequiresUserGesture(false);
  CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  if(Build.VERSION.SDK_INT>=26) settings.setSafeBrowsingEnabled(true);
  setupFiles(); setupChrome(); setupNavigation();
  web.setDownloadListener((url,agent,disposition,mime,size) -> {
   if(url.startsWith("https://")) openExternal(Uri.parse(url));
   else notice("Не удалось сохранить файл. Используйте меню «Открыть в браузере».");
  });
  root.addView(web,new LinearLayout.LayoutParams(-1,0,1)); setContentView(root);
  if(Build.VERSION.SDK_INT>=30) {
   root.setOnApplyWindowInsetsListener((v,insets) -> {
    android.graphics.Insets safe=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());
    v.setPadding(safe.left,safe.top,safe.right,safe.bottom); return WindowInsets.CONSUMED;
   });
   root.requestApplyInsets();
  } else root.setFitsSystemWindows(true);
  if(state==null || web.restoreState(state)==null) web.loadUrl(NativePolicy.SITE);
 }
 private int dp(int n) { return Math.round(n*getResources().getDisplayMetrics().density); }
 private void notice(String text) { if(!destroyed) Toast.makeText(this,text,Toast.LENGTH_LONG).show(); }
 private void setupFiles() {
  if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
   notice("Для сохранения результатов обновите Android System WebView или откройте Talgat AI в браузере."); return;
  }
  WebViewCompat.addWebMessageListener(web,"TalgatFiles",Collections.singleton("https://talgat-ai.netlify.app"),
   (view,message,origin,isMainFrame,reply) -> {
    if(!isMainFrame || !NativePolicy.trusted(origin.toString()) || !NativePolicy.trusted(view.getUrl())) return;
    String raw=message.getData(); if(raw==null || raw.length()>17*1024*1024) { notice("Слишком большой файл."); return; }
    try {
     JSONObject data=new JSONObject(raw); String type=data.optString("type");
     if(type.equals("notice")) { notice(data.optString("message").substring(0,Math.min(180,data.optString("message").length()))); return; }
     if(type.equals("print")) {
      PrintManager manager=(PrintManager)getSystemService(PRINT_SERVICE);
      manager.print("Talgat AI",web.createPrintDocumentAdapter("Talgat AI"),new PrintAttributes.Builder().build()); return;
     }
     if(!type.equals("save")) return;
     if(pendingDownload!=null) { notice("Сначала сохраните или отмените предыдущий файл."); return; }
     String encoded=data.getString("base64"); if(encoded.length()>16*1024*1024) { notice("Максимальный размер — 12 МБ."); return; }
     byte[] bytes=Base64.decode(encoded,Base64.DEFAULT); if(bytes.length>NativePolicy.MAX_BYTES) return;
     pendingDownload=bytes;
     Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
      .setType(NativePolicy.mime(data.optString("mime"))).putExtra(Intent.EXTRA_TITLE,NativePolicy.filename(data.optString("filename")));
     try { startActivityForResult(intent,SAVE_FILE); } catch(Exception error) { pendingDownload=null; notice("Не найдено приложение для сохранения файлов."); }
    } catch(Exception error) { notice("Не удалось подготовить файл для сохранения."); }
   });
 }
 private void setupChrome() {
  web.setWebChromeClient(new WebChromeClient() {
   @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params) {
    if(!NativePolicy.trusted(view.getUrl())) return false;
    if(fileCallback!=null) fileCallback.onReceiveValue(null);
    fileCallback=callback;
    try { startActivityForResult(params.createIntent().addCategory(Intent.CATEGORY_OPENABLE),FILE_PICKER); }
    catch(Exception error) { fileCallback=null; callback.onReceiveValue(null); notice("Не удалось открыть выбор файлов."); }
    return true;
   }
   @Override public void onPermissionRequest(PermissionRequest request) {
    runOnUiThread(() -> {
     if(!NativePolicy.trusted(request.getOrigin().toString()) || !NativePolicy.trusted(web.getUrl())) { request.deny(); return; }
     boolean audio=false; for(String resource:request.getResources()) if(PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) audio=true;
     if(!audio || audioRequest!=null) { request.deny(); return; }
     if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED) request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
     else { audioRequest=request; requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},AUDIO_PERMISSION); }
    });
   }
   @Override public void onPermissionRequestCanceled(PermissionRequest request) { if(audioRequest==request) audioRequest=null; }
  });
 }
 private void setupNavigation() {
  web.setWebViewClient(new WebViewClient() {
   @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon) {
    status.setText("Загрузка…"); status.setVisibility(View.VISIBLE);
    if(audioRequest!=null) { audioRequest.deny(); audioRequest=null; }
   }
   @Override public void onPageFinished(WebView view,String url) {
    if(!NativePolicy.trusted(url)) return;
    status.setVisibility(View.GONE);
    try(InputStream stream=getAssets().open("android_downloads.js")) {
     java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream(); byte[] buffer=new byte[4096]; int count;
     while((count=stream.read(buffer))!=-1) out.write(buffer,0,count);
     view.evaluateJavascript(new String(out.toByteArray(),StandardCharsets.UTF_8),null);
    } catch(Exception error) { notice("Сохранение файлов недоступно. Откройте приложение заново."); }
   }
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) {
    if(!request.isForMainFrame()) return !NativePolicy.trusted(request.getUrl().toString());
    if(NativePolicy.trusted(request.getUrl().toString())) return false;
    openExternal(request.getUrl()); return true;
   }
   @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,SslError error) {
    handler.cancel(); showOffline("Не удалось проверить защищённое соединение. Проверьте дату и интернет.");
   }
   @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error) {
    if(request.isForMainFrame()) showOffline("Нет подключения. Проверьте интернет и нажмите ↻ вверху.");
   }
   @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response) {
    if(request.isForMainFrame() && response.getStatusCode()>=400) showOffline("Сервер временно недоступен. Нажмите ↻, чтобы повторить.");
   }
  });
 }
 private void showOffline(String text) {
  status.setText(text); status.setVisibility(View.VISIBLE);
  web.loadData("<html><meta name='viewport' content='width=device-width,initial-scale=1'><body style='background:#09101c;color:white;padding:24px;font:18px sans-serif'><h2>Talgat AI</h2><p>Проверьте подключение и нажмите кнопку обновления вверху.</p></body></html>","text/html","UTF-8");
 }
 private void openExternal(Uri uri) {
  String scheme=uri.getScheme(); if(!"https".equalsIgnoreCase(scheme) && !"tel".equalsIgnoreCase(scheme) && !"mailto".equalsIgnoreCase(scheme)) return;
  try { startActivity(new Intent(Intent.ACTION_VIEW,uri).addCategory(Intent.CATEGORY_BROWSABLE)); }
  catch(Exception error) { notice("На телефоне нет приложения для этой ссылки."); }
 }
 @Override protected void onActivityResult(int request,int result,Intent data) {
  super.onActivityResult(request,result,data);
  if(request==FILE_PICKER && fileCallback!=null) {
   Uri[] uris=WebChromeClient.FileChooserParams.parseResult(result,data);
   ArrayList<Uri> safe=new ArrayList<>();
   if(uris!=null) for(Uri uri:uris) {
    if(!"content".equals(uri.getScheme()) || getPackageName().equals(uri.getAuthority())) continue;
    try(android.content.res.AssetFileDescriptor ignored=getContentResolver().openAssetFileDescriptor(uri,"r")) { safe.add(uri); }
    catch(Exception ignored) { }
   }
   fileCallback.onReceiveValue(safe.isEmpty()?null:safe.toArray(new Uri[0])); fileCallback=null;
  }
  if(request==SAVE_FILE) {
   byte[] bytes=pendingDownload; pendingDownload=null;
   if(result!=RESULT_OK || data==null || data.getData()==null || bytes==null) return;
   Uri uri=data.getData();
   fileWriter.execute(() -> {
    try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")) {
     if(out==null) throw new java.io.IOException(); out.write(bytes);
     runOnUiThread(() -> notice("Файл сохранён."));
    } catch(Exception error) { runOnUiThread(() -> notice("Не удалось сохранить файл. Выберите другую папку.")); }
   });
  }
 }
 @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results) {
  super.onRequestPermissionsResult(request,permissions,results);
  if(request==AUDIO_PERMISSION && audioRequest!=null) {
   if(results.length>0 && results[0]==PackageManager.PERMISSION_GRANTED && NativePolicy.trusted(web.getUrl())) audioRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
   else audioRequest.deny(); audioRequest=null;
  }
 }
 @Override protected void onSaveInstanceState(Bundle state) { super.onSaveInstanceState(state); web.saveState(state); }
 @Override protected void onPause() { super.onPause(); web.onPause(); web.evaluateJavascript("if(typeof stopVoiceSession==='function')stopVoiceSession();",null); }
 @Override protected void onResume() { super.onResume(); if(web!=null) web.onResume(); }
 @Override public void onBackPressed() {
  if(!NativePolicy.trusted(web.getUrl())) { web.loadUrl(NativePolicy.SITE); return; }
  web.evaluateJavascript("(function(){var d=document.querySelector('dialog[open]');if(d){d.close();return true;}return false;})()",result -> {
   if(!"true".equals(result)) { if(web.canGoBack()) web.goBack(); else finish(); }
  });
 }
 @Override protected void onDestroy() {
  destroyed=true; if(fileCallback!=null) fileCallback.onReceiveValue(null);
  if(audioRequest!=null) audioRequest.deny(); pendingDownload=null;
  root.removeView(web); web.destroy(); fileWriter.shutdown(); super.onDestroy();
 }
}
