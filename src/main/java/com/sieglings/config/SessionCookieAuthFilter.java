package com.sieglings.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.List;

/**
 * Bridges httpOnly cookie auth onto the existing {@code Authorization: Bearer}
 * contract. When a request carries the {@code sgl_session} cookie but no explicit
 * Authorization header, this wraps the request so downstream controllers (which
 * all read the Authorization header) authenticate transparently from the cookie.
 *
 * An explicit Authorization header always wins, so legacy clients that still send
 * the Bearer token from localStorage keep working unchanged during migration.
 */
@Component
public class SessionCookieAuthFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String existing = request.getHeader("Authorization");
        if (existing == null || existing.isBlank()) {
            String token = readSessionCookie(request);
            if (token != null && !token.isBlank()) {
                chain.doFilter(new AuthorizationHeaderRequest(request, "Bearer " + token), response);
                return;
            }
        }
        chain.doFilter(request, response);
    }

    private String readSessionCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (SessionCookieService.SESSION_COOKIE.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    /** Request wrapper that injects a synthesized Authorization header. */
    private static final class AuthorizationHeaderRequest extends HttpServletRequestWrapper {
        private final String authorization;

        AuthorizationHeaderRequest(HttpServletRequest request, String authorization) {
            super(request);
            this.authorization = authorization;
        }

        @Override
        public String getHeader(String name) {
            if ("Authorization".equalsIgnoreCase(name)) {
                return authorization;
            }
            return super.getHeader(name);
        }

        @Override
        public Enumeration<String> getHeaders(String name) {
            if ("Authorization".equalsIgnoreCase(name)) {
                return Collections.enumeration(List.of(authorization));
            }
            return super.getHeaders(name);
        }

        @Override
        public Enumeration<String> getHeaderNames() {
            LinkedHashSet<String> names = new LinkedHashSet<>();
            Enumeration<String> existing = super.getHeaderNames();
            while (existing != null && existing.hasMoreElements()) {
                names.add(existing.nextElement());
            }
            names.add("Authorization");
            return Collections.enumeration(names);
        }
    }
}
