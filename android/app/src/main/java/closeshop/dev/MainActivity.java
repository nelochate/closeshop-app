package closeshop.dev;

import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    private static final String ANDROID_SYSTEM_INSETS_EVENT = "closeshop:android-system-insets";

    @Override
    protected void load() {
        super.load();
        applyAndroidNavigationBarAppearance();
        initAndroidSafeAreaBridge();
    }

    @Override
    public void onResume() {
        super.onResume();
        applyAndroidNavigationBarAppearance();
    }

    private void initAndroidSafeAreaBridge() {
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }

        final WebView webView = getBridge().getWebView();
        final View insetHostView = (View) webView.getParent();
        if (insetHostView == null) {
            return;
        }

        webView.setBackgroundColor(Color.BLACK);
        insetHostView.setBackgroundColor(Color.BLACK);

        getBridge().addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    super.onPageCommitVisible(view, url);
                    applyAndroidNavigationBarAppearance();
                    ViewCompat.requestApplyInsets(insetHostView);
                }
            }
        );

        ViewCompat.setOnApplyWindowInsetsListener(insetHostView, (view, windowInsets) -> {
            applyAndroidNavigationBarAppearance();
            injectSafeAreaInsets(getSafeAreaInsets(windowInsets));
            return windowInsets;
        });

        ViewCompat.requestApplyInsets(insetHostView);
    }

    private void applyAndroidNavigationBarAppearance() {
        Window window = getWindow();
        if (window == null) {
            return;
        }

        window.setNavigationBarColor(Color.BLACK);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.setNavigationBarDividerColor(Color.BLACK);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(true);
        }

        View decorView = window.getDecorView();
        if (decorView != null) {
            decorView.setBackgroundColor(Color.BLACK);

            WindowInsetsControllerCompat insetsController = ViewCompat.getWindowInsetsController(decorView);
            if (insetsController != null) {
                insetsController.setAppearanceLightNavigationBars(false);
            }
        }

        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }

        WebView webView = getBridge().getWebView();
        webView.setBackgroundColor(Color.BLACK);

        View insetHostView = (View) webView.getParent();
        if (insetHostView != null) {
            insetHostView.setBackgroundColor(Color.BLACK);
        }
    }

    @NonNull
    private Insets getSafeAreaInsets(@NonNull WindowInsetsCompat windowInsets) {
        Insets safeAreaInsets = windowInsets.getInsets(
            WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
        );

        if (windowInsets.isVisible(WindowInsetsCompat.Type.ime())) {
            return Insets.of(safeAreaInsets.left, safeAreaInsets.top, safeAreaInsets.right, safeAreaInsets.bottom);
        }

        return safeAreaInsets;
    }

    private void injectSafeAreaInsets(@NonNull Insets safeAreaInsets) {
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }

        applyAndroidNavigationBarAppearance();

        float density = getResources().getDisplayMetrics().density;
        final int topInset = Math.max(0, Math.round(safeAreaInsets.top / density));
        final int rightInset = Math.max(0, Math.round(safeAreaInsets.right / density));
        final int bottomInset = Math.max(0, Math.round(safeAreaInsets.bottom / density));
        final int leftInset = Math.max(0, Math.round(safeAreaInsets.left / density));

        final String script = String.format(
            Locale.US,
            """
            try {
              const detail = { top: %1$d, right: %2$d, bottom: %3$d, left: %4$d };
              const root = document.documentElement;
              if (root) {
                root.style.setProperty('--safe-area-inset-top', '%1$dpx');
                root.style.setProperty('--safe-area-inset-right', '%2$dpx');
                root.style.setProperty('--safe-area-inset-bottom', '%3$dpx');
                root.style.setProperty('--safe-area-inset-left', '%4$dpx');
              }
              window.dispatchEvent(new CustomEvent('%5$s', { detail }));
            } catch (error) {
              console.error('Failed to sync Android safe area insets', error);
            }
            """,
            topInset,
            rightInset,
            bottomInset,
            leftInset,
            ANDROID_SYSTEM_INSETS_EVENT
        );

        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(script, null));
    }
}
