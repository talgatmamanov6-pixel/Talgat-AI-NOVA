package kz.talgat.nova;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.graphics.Color;
import android.widget.TextView;
import android.widget.LinearLayout;
import android.view.View;
public class MainActivity extends Activity {
 private WebView web;
 private static final String SITE = "https://talgat-ai.netlify.app/";
 @Override public void onCreate(Bundle b){
  super.onCreate(b);
  web=new WebView(this);
  web.setBackgroundColor(Color.rgb(7,16,30));
  web.getSettings().setJavaScriptEnabled(true);
  web.getSettings().setDomStorageEnabled(true);
  web.getSettings().setMediaPlaybackRequiresUserGesture(false);
  web.getSettings().setAllowFileAccess(false);
  web.getSettings().setAllowContentAccess(false);
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request){
    String url=request.getUrl().toString();
    if(url.startsWith("https://talgat-ai.netlify.app/")) return false;
    if(url.startsWith("https://")) {startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW,request.getUrl()));}
    return true;
   }
   @Override public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err){
    if(req.isForMainFrame()) {
      view.loadDataWithBaseURL(null,"<html><meta name='viewport' content='width=device-width,initial-scale=1'><body style='background:#07101e;color:white;font:18px sans-serif;padding:24px'><h2>TALGAT AI NOVA</h2><p>Не удалось подключиться к Talgat AI. Проверьте интернет и попробуйте ещё раз.</p><a style='color:#7ceaff' href='https://talgat-ai.netlify.app/'>Повторить подключение</a></body></html>","text/html","UTF-8",null);
    }
   }
  });
  setContentView(web);
  web.loadUrl(SITE);
 }
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
}
