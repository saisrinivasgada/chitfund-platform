package com.chitfund.supportservice.config;

import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.time.Duration;
import java.util.Map;

/**
 * Distributed cache via Redis. All service instances share the same cache,
 * so evictions (on sendMessage, markRead) propagate immediately across pods.
 *
 * In prod, point REDIS_URL to AWS ElastiCache (single-node or cluster-mode disabled).
 */
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public RedisCacheManager cacheManager(RedisConnectionFactory factory) {
        RedisCacheConfiguration base = RedisCacheConfiguration.defaultCacheConfig()
                .serializeKeysWith(RedisSerializationContext.SerializationPair
                        .fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(RedisSerializationContext.SerializationPair
                        .fromSerializer(new GenericJackson2JsonRedisSerializer()))
                .disableCachingNullValues();

        return RedisCacheManager.builder(factory)
                .withInitialCacheConfigurations(Map.of(
                        // Conversation list per tenant — short TTL, evicted on new message
                        "convList", base.entryTtl(Duration.ofSeconds(20)),
                        // Per-user unread badge count — slightly longer, evicted on markRead/send
                        "convUnread", base.entryTtl(Duration.ofSeconds(45))
                ))
                .cacheDefaults(base.entryTtl(Duration.ofMinutes(5)))
                .build();
    }
}
