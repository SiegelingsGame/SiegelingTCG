package com.sieglings.config;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Issues and clears the session cookies that back httpOnly cookie authentication.
 *
 * Two cookies are written together:
 *   - {@code __session}: the opaque session token, HttpOnly so page scripts (and
 *     therefore any XSS) can never read it. This is the actual credential.
 *   - {@code sgl_auth}: a readable, value-less ("1") flag carrying NO secret. The
 *     client reads it only as an optimistic "a session probably exists" hint for
 *     first paint. It is NOT proof that cookies reach the backend — see below.
 *
 * The session cookie MUST be named {@code __session}. Firebase Hosting strips every
 * cookie except that one from requests it forwards to Cloud Run / Cloud Functions
 * (it is the only name allowed into the CDN cache key), so any other name simply
 * never arrives in production and the session silently fails to authenticate. It is
 * scoped to {@code Path=/api} so it rides API calls only and never becomes part of
 * the Hosting cache key for static assets.
 *
 * Because a cookie can be stored by the browser and still be dropped in transit,
 * clients must never infer "cookie auth works" from a readable cookie. The server
 * reports what it actually received via {@code cookieSession} on /api/auth/me.
 *
 * Both use {@code SameSite=Lax}, which keeps the cookie off cross-site POSTs (the
 * baseline CSRF defense) while still riding same-origin navigation between the hub
 * and the Play page.
 */
@Component
public class SessionCookieService {

    public static final String SESSION_COOKIE = "__session";
    /** Pre-{@code __session} cookie name; still read so existing sessions survive the rename. */
    public static final String LEGACY_SESSION_COOKIE = "sgl_session";
    public static final String AUTH_FLAG_COOKIE = "sgl_auth";

    private static final String SESSION_COOKIE_PATH = "/api";
    private static final String ROOT_PATH = "/";

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
        response.addHeader("Set-Cookie", build(SESSION_COOKIE, token, MAX_AGE_SECONDS, SESSION_COOKIE_PATH, true));
        response.addHeader("Set-Cookie", build(AUTH_FLAG_COOKIE, "1", MAX_AGE_SECONDS, ROOT_PATH, false));
        // Retire any pre-rename credential so a stale sgl_session can't outlive the
        // account it belonged to (it is unreadable in production anyway).
        response.addHeader("Set-Cookie", build(LEGACY_SESSION_COOKIE, "", 0, ROOT_PATH, true));
    }

    /** Expire every session cookie (used on logout / account deletion). */
    public void clearSession(HttpServletResponse response) {
        response.addHeader("Set-Cookie", build(SESSION_COOKIE, "", 0, SESSION_COOKIE_PATH, true));
        response.addHeader("Set-Cookie", build(LEGACY_SESSION_COOKIE, "", 0, ROOT_PATH, true));
        response.addHeader("Set-Cookie", build(AUTH_FLAG_COOKIE, "", 0, ROOT_PATH, false));
    }

    private String build(String name, String value, long maxAgeSeconds, String path, boolean httpOnly) {
        StringBuilder cookie = new StringBuilder();
        cookie.append(name).append('=').append(value);
        cookie.append("; Max-Age=").append(maxAgeSeconds);
        cookie.append("; Path=").append(path);
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
