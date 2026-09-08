package site.gachijoopging.server.architecture.fixture.compliant.domain.alpha.domain.service;

import site.gachijoopging.server.architecture.fixture.compliant.domain.alpha.infrastructure.persistence.AlphaRepository;

class AlphaService {

  private final AlphaRepository alphaRepository;

  AlphaService(AlphaRepository alphaRepository) {
    this.alphaRepository = alphaRepository;
  }
}
