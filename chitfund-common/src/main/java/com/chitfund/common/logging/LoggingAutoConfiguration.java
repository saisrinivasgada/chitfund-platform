package com.chitfund.common.logging;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.core.Ordered;

@AutoConfiguration
public class LoggingAutoConfiguration {

    /**
     * Registers MdcLoggingFilter at the very top of the filter chain
     * so every subsequent filter and controller has MDC context available.
     */
    @Bean
    public FilterRegistrationBean<MdcLoggingFilter> mdcLoggingFilter() {
        FilterRegistrationBean<MdcLoggingFilter> reg = new FilterRegistrationBean<>(new MdcLoggingFilter());
        reg.addUrlPatterns("/*");
        reg.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return reg;
    }
}
