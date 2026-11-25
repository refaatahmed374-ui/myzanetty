package com.myzanetty.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;

/** ودجت الشاشة الرئيسية: صافي الشهر + الإيرادات والمصروفات + زر إضافة سريع */
public class BudgetWidget extends AppWidgetProvider {
    public static final String PREFS = "myzanetty_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            manager.updateAppWidget(id, build(context));
        }
    }

    static RemoteViews build(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_budget);
        v.setTextViewText(R.id.w_title, p.getString("title", context.getString(R.string.app_name)));
        v.setTextViewText(R.id.w_income, p.getString("income", "—"));
        v.setTextViewText(R.id.w_expense, p.getString("expense", "—"));
        v.setTextViewText(R.id.w_net, p.getString("net", context.getString(R.string.widget_open_app)));
        boolean positive = !"false".equals(p.getString("positive", "true"));
        v.setTextColor(R.id.w_net, positive ? 0xFF0F9D76 : 0xFFDC4C4A);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(context, 0, open, flags));

        Intent add = new Intent(Intent.ACTION_VIEW, Uri.parse("myzanetty://add"), context, MainActivity.class);
        add.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.w_add, PendingIntent.getActivity(context, 1, add, flags));
        return v;
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, BudgetWidget.class));
        for (int id : ids) {
            manager.updateAppWidget(id, build(context));
        }
    }
}
