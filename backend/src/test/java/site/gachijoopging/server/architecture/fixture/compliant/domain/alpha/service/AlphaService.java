package site.gachijoopging.server.architecture.fixture.compliant.domain.alpha.service;

import site.gachijoopging.server.architecture.fixture.compliant.domain.alpha.repository.AlphaRepository;

class AlphaService {

  private final AlphaRepository alphaRepository;

  AlphaService(AlphaRepository alphaRepository) {
    this.alphaRepository = alphaRepository;
  }
}
