package ir.zanis.games;

import android.app.Activity;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

/**
 * Hosts the practice version of the lights game (a web app bundled in assets/www) in a full-screen
 * WebView.
 *
 * The assets are served through WebViewAssetLoader from a virtual https origin: ES modules do not
 * load from file:// URLs, and an https page may call the game server for the current settings.
 */
public class MainActivity extends Activity {

    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + APP_HOST + "/assets/www/index.html";
    private static final String LOG_TAG = "ZanisGames";

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = new WebView(this);
        webView.setBackgroundColor(getColor(R.color.background));
        setContentView(webView);
        enterImmersiveMode();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        // Visitors must not be able to change the layout with the system font size.
        settings.setTextZoom(100);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Never navigate away from the bundled pages (the game server is only called with fetch).
                return !APP_HOST.equals(request.getUrl().getHost());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                Log.e(LOG_TAG, "load failed: " + request.getUrl() + " — " + error.getDescription());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                // Surface page messages in logcat; they are the only trace of a JavaScript failure on a
                // device, and the CI smoke test waits for the "ready" line the web app logs on start.
                if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                    Log.e(LOG_TAG, "console error: " + message.message()
                            + " (" + message.sourceId() + ":" + message.lineNumber() + ")");
                } else {
                    Log.i(LOG_TAG, message.message());
                }
                return true;
            }
        });

        webView.addJavascriptInterface(new Bridge(), "Android");

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @SuppressWarnings("deprecation")
    private void enterImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enterImmersiveMode();
        }
    }

    /** Back never closes the app; it returns to the start screen instead. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        webView.evaluateJavascript("location.hash = '#/'", null);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }

    /** Functions the web app can call as window.Android.* (see web/js/core/util.js). */
    private final class Bridge {

        @JavascriptInterface
        public void vibrate(int milliseconds) {
            Vibrator vibrator = getSystemService(Vibrator.class);
            if (vibrator == null || !vibrator.hasVibrator()) {
                return;
            }
            int duration = Math.max(1, Math.min(milliseconds, 500));
            vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE));
        }
    }
}
