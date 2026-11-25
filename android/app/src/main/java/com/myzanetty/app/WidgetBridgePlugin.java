package com.myzanetty.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** يستقبل ملخص الشهر من التطبيق ويحفظه للودجت ثم يحدّثه */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {
    private static final String[] KEYS = { "title", "income", "expense", "net", "positive" };

    @PluginMethod
    public void update(PluginCall call) {
        Context ctx = getContext();
        SharedPreferences.Editor editor = ctx.getSharedPreferences(BudgetWidget.PREFS, Context.MODE_PRIVATE).edit();
        for (String key : KEYS) {
            editor.putString(key, call.getString(key, ""));
        }
        editor.apply();
        BudgetWidget.updateAll(ctx);
        call.resolve();
    }
}
