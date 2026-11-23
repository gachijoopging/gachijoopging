package site.gachijoopging.server.domain.activity.service;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.activity")
public record ActivityProperties(double routeSimplifyMeters) {}
