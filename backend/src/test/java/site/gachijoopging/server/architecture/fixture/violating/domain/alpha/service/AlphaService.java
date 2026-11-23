package site.gachijoopging.server.architecture.fixture.violating.domain.alpha.service;

import site.gachijoopging.server.architecture.fixture.violating.domain.beta.repository.BetaRepository;

class AlphaService {

  private final BetaRepository betaRepository;

  AlphaService(BetaRepository betaRepository) {
    this.betaRepository = betaRepository;
  }
}
