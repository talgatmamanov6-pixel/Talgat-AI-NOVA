package kz.talgat.nova;
import android.app.Activity;
import android.Manifest;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebChromeClient;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.graphics.Color;
import android.app.AlertDialog;
import android.view.Menu;
import android.view.MenuItem;
import android.widget.EditText;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
public class MainActivity extends Activity {
 private WebView web;
 private ValueCallback<Uri[]> fileCallback;
 private PermissionRequest audioRequest;
 private static final int FILE_PICKER=1201;
 private static final int AUDIO_PERMISSION=1202;
 private static final String SITE="https://talgat-ai.netlify.app/";
 @Override public void onCreate(Bundle b) {
  super.onCreate(b);
  web=new WebView(this);
  web.setBackgroundColor(Color.rgb(7,16,30));
  web.getSettings().setJavaScriptEnabled(true);
  web.getSettings().setDomStorageEnabled(true);
  web.getSettings().setMediaPlaybackRequiresUserGesture(false);
  web.getSettings().setAllowFileAccess(false);
  web.getSettings().setAllowContentAccess(false);
  web.setWebChromeClient(new WebChromeClient() {
   @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
    if(fileCallback!=null)fileCallback.onReceiveValue(null);
    fileCallback=callback;
    try {
     Intent intent=params.createIntent();
     startActivityForResult(intent,FILE_PICKER);
     return true;
    }catch(Exception e){fileCallback=null;return false;}
   }
   @Override public void onPermissionRequest(PermissionRequest request) {
    runOnUiThread(()->{
     Uri origin=request.getOrigin();
     if(origin==null||!"https".equals(origin.getScheme())||!"talgat-ai.netlify.app".equals(origin.getHost())){
      request.deny();return;
     }
     boolean audio=false;
     for(String resource:request.getResources())if(PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource))audio=true;
     if(!audio){request.deny();return;}
     audioRequest=request;
     if(android.os.Build.VERSION.SDK_INT>=23&&checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
      requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},AUDIO_PERMISSION);
     }else request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
    });
   }
  });
  web.setWebViewClient(new WebViewClient() {
   @Override public void onPageFinished(WebView view, String url) {
    super.onPageFinished(view,url);
    if(!url.startsWith(SITE))return;
    try {
     InputStream stream=getAssets().open("nova_visual.js");
     ByteArrayOutputStream bytes=new ByteArrayOutputStream();
     byte[] buffer=new byte[4096];int n;
     while((n=stream.read(buffer))!=-1)bytes.write(buffer,0,n);
     stream.close();
     view.evaluateJavascript(new String(bytes.toByteArray(),StandardCharsets.UTF_8),null);
    }catch(Exception ignored){}
   }

   @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
    String url=request.getUrl().toString();
    if(url.startsWith(SITE)) return false;
    if(url.startsWith("https://")) startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW,request.getUrl()));
    return true;
   }
   @Override public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
    if(req.isForMainFrame()) view.loadDataWithBaseURL(null,"<html><meta name='viewport' content='width=device-width,initial-scale=1'><body style='background:#07101e;color:white;font:18px sans-serif;padding:24px'><h2>TALGAT AI NOVA</h2><p>Нет подключения к серверу. Проверьте интернет.</p></body></html>","text/html","UTF-8",null);
   }
  });
  setContentView(web);
  web.loadUrl(SITE);
 }
 @Override public boolean onCreateOptionsMenu(Menu menu) {
  menu.add(0,1,0,"База знаний (офлайн)");
  menu.add(0,2,1,"Обновить чат");
  return true;
 }
 @Override public boolean onOptionsItemSelected(MenuItem item) {
  if(item.getItemId()==1){openKnowledge();return true;}
  if(item.getItemId()==2){web.loadUrl(SITE);return true;}
  return super.onOptionsItemSelected(item);
 }
 private void openKnowledge() {
  final EditText input=new EditText(this);
  input.setSingleLine(false);
  input.setHint("Например: локальная модель, память, Docker");
  new AlertDialog.Builder(this).setTitle("Поиск по материалам TALGAT AI").setView(input)
   .setPositiveButton("Найти",(dialog,which)->showResults(input.getText().toString()))
   .setNegativeButton("Отмена",null).show();
 }
 private void showResults(String query) {
  StringBuilder result=new StringBuilder();
  try {
   InputStream stream=getAssets().open("knowledge.json");
   ByteArrayOutputStream bytes=new ByteArrayOutputStream();
   byte[] buffer=new byte[4096]; int count;
   while((count=stream.read(buffer))!=-1)bytes.write(buffer,0,count);
   stream.close();
   JSONArray docs=new JSONArray(new String(bytes.toByteArray(),StandardCharsets.UTF_8));
   String[] terms=query.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+");
   int found=0;
   for(int i=0;i<docs.length();i++){
    JSONObject doc=docs.getJSONObject(i);
    String text=doc.getString("text");
    String lower=text.toLowerCase(Locale.ROOT);
    int hits=0;
    for(String term:terms)if(term.length()>2&&lower.contains(term))hits++;
    if(hits>0){found++;result.append("Источник: ").append(doc.getString("source")).append("\n").append(text).append("\n\n");}
   }
   if(found==0)result.append("В локальной базе совпадений нет. Это не означает, что модель обучена на данном вопросе.");
  }catch(Exception e){result.append("Ошибка чтения базы знаний: ").append(e.getMessage());}
  ScrollView scroll=new ScrollView(this);
  TextView view=new TextView(this);
  view.setText(result.toString());view.setTextSize(15);view.setPadding(24,20,24,20);
  scroll.addView(view);
  new AlertDialog.Builder(this).setTitle("Материалы — результаты поиска").setView(scroll).setPositiveButton("Закрыть",null).show();
 }
 @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
  super.onActivityResult(requestCode,resultCode,data);
  if(requestCode==FILE_PICKER&&fileCallback!=null){
   fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode,data));
   fileCallback=null;
  }
 }
 @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] grantResults){
  super.onRequestPermissionsResult(requestCode,permissions,grantResults);
  if(requestCode==AUDIO_PERMISSION&&audioRequest!=null){
   if(grantResults.length>0&&grantResults[0]==PackageManager.PERMISSION_GRANTED)
    audioRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
   else audioRequest.deny();
   audioRequest=null;
  }
 }
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
}
