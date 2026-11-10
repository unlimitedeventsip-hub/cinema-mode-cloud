package ro.unlimited.cinemamode;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.widget.FrameLayout;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final String HOME = "https://cinema-mode-cloud.unlimited-events-ip.workers.dev/?mode=projector";
    private static final String HOST = "cinema-mode-cloud.unlimited-events-ip.workers.dev";
    private static final int SELECT_FILE = 2401;
    private FrameLayout root;
    private WebView webView;
    private View fullScreenView;
    private WebChromeClient.CustomViewCallback fullScreenCallback;
    private ValueCallback<Uri[]> fileCallback;

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        immersive();

        root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equalsIgnoreCase(uri.getHost()) && "https".equals(uri.getScheme())) return false;
                if ("https".equals(uri.getScheme())) {
                    try {startActivity(new Intent(Intent.ACTION_VIEW, uri));}
                    catch (Exception ignored) {Toast.makeText(MainActivity.this, "Link extern indisponibil", Toast.LENGTH_SHORT).show();}
                }
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
                pick.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"video/*","text/plain","application/x-subrip","application/octet-stream"});
                pick.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try {startActivityForResult(Intent.createChooser(pick, "Alege filmul sau subtitrarea"), SELECT_FILE);}
                catch (Exception e) {
                    fileCallback.onReceiveValue(null);
                    fileCallback = null;
                    Toast.makeText(MainActivity.this, "Nu există un selector de fișiere compatibil", Toast.LENGTH_LONG).show();
                }
                return true;
            }
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullScreenView != null) {callback.onCustomViewHidden();return;}
                fullScreenView=view;
                fullScreenCallback=callback;
                webView.setVisibility(View.GONE);
                root.addView(view,new FrameLayout.LayoutParams(-1,-1));
                immersive();
            }
            @Override public void onHideCustomView() {
                if (fullScreenView == null) return;
                root.removeView(fullScreenView);
                fullScreenView=null;
                webView.setVisibility(View.VISIBLE);
                if (fullScreenCallback != null) fullScreenCallback.onCustomViewHidden();
                fullScreenCallback=null;
                immersive();
            }
        });
        webView.loadUrl(HOME);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode!=SELECT_FILE || fileCallback==null)return;
        Uri[] selected=null;
        if(resultCode==RESULT_OK && data!=null){
            if(data.getClipData()!=null){
                int n=data.getClipData().getItemCount();
                selected=new Uri[n];
                for(int i=0;i<n;i++) selected[i]=data.getClipData().getItemAt(i).getUri();
            }else if(data.getData()!=null)selected=new Uri[]{data.getData()};
        }
        fileCallback.onReceiveValue(selected);
        fileCallback=null;
    }

    @Override public void onBackPressed() {
        if(fullScreenView!=null){
            webView.getWebChromeClient().onHideCustomView();
        }else if(webView.canGoBack()){
            webView.goBack();
        }else{
            super.onBackPressed();
        }
    }

    @Override protected void onPause(){super.onPause();if(webView!=null)webView.onPause();}
    @Override protected void onResume(){super.onResume();if(webView!=null)webView.onResume();immersive();}
    @Override protected void onDestroy(){
        if(fileCallback!=null){fileCallback.onReceiveValue(null);fileCallback=null;}
        if(webView!=null){root.removeView(webView);webView.destroy();webView=null;}
        super.onDestroy();
    }
}
