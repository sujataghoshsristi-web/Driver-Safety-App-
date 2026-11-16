package com.drivelock.safety;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final int REQUEST_PERMISSIONS_CODE = 1001;
    private String pendingCallNumber = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Request CALL_PHONE and RECORD_AUDIO permissions on startup for direct calling + WebRTC two-way voice
        checkAndRequestPermissions();

        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();
            webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
            webView.addJavascriptInterface(new AndroidCallBridge(), "Android");

            // Grant WebRTC microphone & audio capture permissions inside Capacitor WebView
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> request.grant(request.getResources()));
                }
            });
        }
    }

    private void checkAndRequestPermissions() {
        String[] permissions = new String[]{
            Manifest.permission.CALL_PHONE,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.MODIFY_AUDIO_SETTINGS
        };
        boolean allGranted = true;
        for (String perm : permissions) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                allGranted = false;
                break;
            }
        }
        if (!allGranted) {
            ActivityCompat.requestPermissions(this, permissions, REQUEST_PERMISSIONS_CODE);
        }
    }

    private void executeDirectPhoneCall(String phoneNumber) {
        if (phoneNumber == null || phoneNumber.trim().isEmpty()) {
            phoneNumber = "82199";
        }
        final String cleanNum = phoneNumber.replaceAll("[^0-9+*#]", "");
        runOnUiThread(() -> {
            try {
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CALL_PHONE)
                        == PackageManager.PERMISSION_GRANTED) {
                    Intent callIntent = new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + cleanNum));
                    callIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(callIntent);
                } else {
                    pendingCallNumber = cleanNum;
                    ActivityCompat.requestPermissions(
                        MainActivity.this,
                        new String[]{Manifest.permission.CALL_PHONE},
                        REQUEST_PERMISSIONS_CODE
                    );
                }
            } catch (Exception e) {
                // Fallback to ACTION_DIAL if carrier blocks ACTION_CALL
                Intent dialIntent = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + cleanNum));
                dialIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(dialIntent);
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_PERMISSIONS_CODE && pendingCallNumber != null) {
            String num = pendingCallNumber;
            pendingCallNumber = null;
            executeDirectPhoneCall(num);
        }
    }

    public class AndroidCallBridge {
        @JavascriptInterface
        public void callNow(String phoneNumber) {
            executeDirectPhoneCall(phoneNumber);
        }

        @JavascriptInterface
        public void callPhone(String phoneNumber) {
            executeDirectPhoneCall(phoneNumber);
        }

        @JavascriptInterface
        public void placeImmediateCall(String jsonPayload) {
            try {
                JSONObject obj = new JSONObject(jsonPayload);
                String num = obj.optString("resolvedPhoneNumber", "82199");
                executeDirectPhoneCall(num);
            } catch (Exception e) {
                executeDirectPhoneCall("82199");
            }
        }
    }
}
