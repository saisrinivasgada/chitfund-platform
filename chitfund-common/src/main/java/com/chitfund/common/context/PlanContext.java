package com.chitfund.common.context;

public final class PlanContext {

    private static final ThreadLocal<String> CURRENT_PLAN = new ThreadLocal<>();

    private PlanContext() {}

    public static void set(String plan) { CURRENT_PLAN.set(plan != null ? plan.toUpperCase() : "BASIC"); }
    public static String get()          { String p = CURRENT_PLAN.get(); return p != null ? p : "BASIC"; }
    public static void clear()          { CURRENT_PLAN.remove(); }
}
