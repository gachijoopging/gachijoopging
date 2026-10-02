package site.gachijoopging.server.domain.user.dto;

import java.util.UUID;

public record UserAccount(UUID id, boolean onboardingRequired) {}
