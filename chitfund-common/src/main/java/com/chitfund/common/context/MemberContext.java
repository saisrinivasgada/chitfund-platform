package com.chitfund.common.context;

public final class MemberContext {

    private static final ThreadLocal<String> CURRENT_MEMBER = new ThreadLocal<>();

    private MemberContext() {}

    public static void set(String memberId) {
        CURRENT_MEMBER.set(memberId);
    }

    public static String get() {
        return CURRENT_MEMBER.get();
    }

    public static void clear() {
        CURRENT_MEMBER.remove();
    }

    public static boolean isPresent() {
        return CURRENT_MEMBER.get() != null;
    }
}
