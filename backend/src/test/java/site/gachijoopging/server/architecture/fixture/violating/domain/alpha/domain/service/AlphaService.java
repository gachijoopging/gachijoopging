package site.gachijoopging.server.architecture.fixture.violating.domain.alpha.domain.service;

import site.gachijoopging.server.architecture.fixture.violating.domain.beta.infrastructure.persistence.BetaRepository;

class AlphaService {

  private final BetaRepository betaRepository;

  AlphaService(BetaRepository betaRepository) {
    this.betaRepository = betaRepository;
  }
}
