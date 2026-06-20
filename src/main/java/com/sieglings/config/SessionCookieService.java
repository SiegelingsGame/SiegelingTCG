package com.sieglings.config;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Issues and clears the session cookies that back httpOnly cookie authentication.
 *
 * Two cookies are written together:
 *   - {@code sgl_session}: the opaque session token, HttpOnly so page scripts (and
 *     therefore any XSS) can never read it. This is the actual credential.
 *   - {@code sgl_auth}: a readable, value-less ("1") flag carrying NO secret. The
 *     client reads it to know a session exists (for optimistic rendering) and to
 *     confirm cookies actually round-trip through Firebase Hosting -> Cloud Run
 *     before it stops sending the legacy Bearer token. Reading it via JS is
 *     harmless because it is not the credential.
 *
 * Both use {@code SameSite=Lax}, which keeps the cookie off cross-site POSTs (the
 * baseline CSRF defense) while still riding same-origin navigation between the hub
 * and the Play page.
 */
@Component
public class SessionCookieService {

    public static final String SESSION_COOKIE = "sgl_session";
    public static final String AUTH_FLAG_COOKIE = "sgl_auth";

    // Mirrors the 30-day server session TTL (AccountService#createSession).
    private static final long MAX_AGE_SECONDS = 30L * 24 * 60 * 60;

    private final boolean secure;

    public SessionCookieService(@Value("${app.auth.cookie-secure:true}") boolean secure) {
        this.secure = secure;
    }

    /** Set (or refresh) the session cookies on the response. No-op for a blank token. */
    public void setSession(HttpServletResponse response, String token) {
        if (token == null || token.isBlank()) {
            return;
        }
        response.addHeader("Set-Cookie", build(SESSION_COOKIE, token, MAX_AGE_SECONDS, true));
        response.addHeader("Set-Cookie", build(AUTH_FLAG_COOKIE, "1", MAX_AGE_SECONDS, false));
    }

    /** Expire both cookies (used on logout / account deletion). */
    public void clearSession(HttpServletResponse response) {
        response.addHeader("Set-Cookie", build(SESSION_COOKIE, "", 0, true));
        response.addHeader("Set-Cookie", build(AUTH_FLAG_COOKIE, "", 0, false));
    }

    private String build(String name, String value, long maxAgeSeconds, boolean httpOnly) {
        StringBuilder cookie = new StringBuilder();
        cookie.append(name).append('=').append(value);
        cookie.append("; Max-Age=").append(maxAgeSeconds);
        cookie.append("; Path=/");
        cookie.append("; SameSite=Lax");
        if (secure) {
            cookie.append("; Secure");
        }
        if (httpOnly) {
            cookie.append("; HttpOnly");
        }
        return cookie.toString();
    }
}
