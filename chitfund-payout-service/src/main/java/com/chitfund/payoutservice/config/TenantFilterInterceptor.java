package com.chitfund.payoutservice.config;

import com.chitfund.common.context.TenantContext;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.hibernate.Session;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class TenantFilterInterceptor implements HandlerInterceptor {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String tenantId = TenantContext.get();
        if (tenantId != null) {
            entityManager.unwrap(Session.class)
                         .enableFilter("tenantFilter")
                         .setParameter("tenantId", tenantId);
        }
        return true;
    }
}
