package com.chitfund.userservice.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

@Service
public class RateLimiterService {

    private final Cache<String, Bucket> loginBuckets = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterAccess(30, TimeUnit.MINUTES)
            .build();

    private final Cache<String, Bucket> forgotBuckets = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterAccess(30, TimeUnit.MINUTES)
            .build();

    // 10 login attempts per IP per 15 min
    public boolean tryConsumeLogin(String ip) {
        return loginBuckets.get(ip, k ->
            Bucket.builder()
                .addLimit(Bandwidth.classic(10, Refill.intervally(10, Duration.ofMinutes(15))))
                .build()
        ).tryConsume(1);
    }

    // 5 forgot-password/OTP requests per IP per 15 min
    public boolean tryConsumeForgot(String ip) {
        return forgotBuckets.get(ip, k ->
            Bucket.builder()
                .addLimit(Bandwidth.classic(5, Refill.intervally(5, Duration.ofMinutes(15))))
                .build()
        ).tryConsume(1);
    }
}
