package com.myzanetty.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // إضافة محلية لتحديث ودجت الشاشة الرئيسية
        registerPlugin(WidgetBridgePlugin.class);
        // تحديث التطبيق من داخله
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
