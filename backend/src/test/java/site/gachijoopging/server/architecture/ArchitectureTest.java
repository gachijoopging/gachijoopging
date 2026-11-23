package site.gachijoopging.server.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMethods;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import com.tngtech.archunit.library.freeze.FreezingArchRule;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;

class ArchitectureTest {

  private static final JavaClasses CLASSES =
      new ClassFileImporter()
          .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
          .importPackages("site.gachijoopging.server.global", "site.gachijoopging.server.domain");

  private static final Pattern DOMAIN_SEGMENT = Pattern.compile("\\.domain\\.([^.]+)\\.");

  private static final List<String> DOMAINS =
      List.of(
          "auth",
          "user",
          "crew",
          "activity",
          "live",
          "post",
          "notice",
          "chat",
          "notification",
          "safety",
          "stats",
          "media");

  private static final Pattern QUERYDSL_GENERATED = Pattern.compile("Q[A-Z]\\w*");

  private static final String CONTROLLER = "..domain.*.controller..";
  private static final String FACADE = "..domain.*.facade..";
  private static final String SERVICE = "..domain.*.service..";
  private static final String REPOSITORY = "..domain.*.repository..";
  private static final String ENTITY = "..domain.*.entity..";
  private static final String CLIENT = "..domain.*.client..";
  private static final String EVENT = "..domain.*.event..";

  @Test
  void L0_repository_가_있는_도메인은_controller_도_있다() {
    Set<String> controllerOwners = domainsHavingPackageSegment(".controller");
    Set<String> repositoryOwners = domainsHavingPackageSegment(".repository");

    assertThat(repositoryOwners).isNotEmpty();
    assertThat(controllerOwners).containsAll(repositoryOwners);
  }

  @Test
  void L1_controller_는_repository_를_직접_부르지_않는다() {
    noClasses()
        .that()
        .resideInAPackage(CONTROLLER)
        .should()
        .dependOnClassesThat()
        .resideInAPackage(REPOSITORY)
        .check(CLASSES);
  }

  @Test
  void L1_controller_는_엔티티를_노출하지_않는다() {
    noClasses()
        .that()
        .resideInAPackage(CONTROLLER)
        .should()
        .dependOnClassesThat(
            JavaClass.Predicates.resideInAPackage(ENTITY)
                .and(DescribedPredicate.not(JavaClass.Predicates.ENUMS)))
        .check(CLASSES);
  }

  @Test
  void L2_service_와_entity_는_controller_와_facade_를_모른다() {
    noClasses()
        .that()
        .resideInAnyPackage(SERVICE, ENTITY)
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage(CONTROLLER, FACADE)
        .check(CLASSES);
  }

  @Test
  void L2b_facade_는_엔티티를_모른다() {
    noClasses()
        .that()
        .resideInAPackage(FACADE)
        .should()
        .dependOnClassesThat(
            JavaClass.Predicates.resideInAPackage(ENTITY)
                .and(DescribedPredicate.not(JavaClass.Predicates.ENUMS)))
        .check(CLASSES);
  }

  @Test
  void L3_client_는_facade_와_event_에서만_부른다() {
    classes()
        .that()
        .resideInAPackage(CLIENT)
        .should()
        .onlyHaveDependentClassesThat()
        .resideInAnyPackage(FACADE, EVENT, CLIENT)
        .check(CLASSES);
  }

  @Test
  void L3b_entity_는_repository_와_client_를_모른다() {
    noClasses()
        .that()
        .resideInAPackage(ENTITY)
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage(REPOSITORY, CLIENT)
        .check(CLASSES);
  }

  @Test
  void L4_repository_와_client_는_controller_를_모른다() {
    noClasses()
        .that()
        .resideInAnyPackage(REPOSITORY, CLIENT)
        .should()
        .dependOnClassesThat()
        .resideInAPackage(CONTROLLER)
        .check(CLASSES);
  }

  @Test
  void R2_타_도메인_repository_를_주입하지_않는다() {
    classes()
        .that()
        .resideInAPackage("..domain..")
        .should(notReachIntoOtherDomain("repository"))
        .check(CLASSES);
  }

  @Test
  void R2_타_도메인_client_를_주입하지_않는다() {
    classes()
        .that()
        .resideInAPackage("..domain..")
        .should(notReachIntoOtherDomain("client"))
        .check(CLASSES);
  }

  @Test
  void R2_타_도메인_엔티티를_필드로_쓰지_않는다() {
    ArchRule rule =
        classes().that().resideInAPackage("..domain..").should(notReachIntoOtherDomain("entity"));
    FreezingArchRule.freeze(rule).check(CLASSES);
  }

  @Test
  void R3_global_은_domain_을_모른다() {
    noClasses()
        .that()
        .resideInAPackage("..global..")
        .should()
        .dependOnClassesThat()
        .resideInAPackage("..domain..")
        .check(CLASSES);
  }

  @Test
  void R4a_facade_는_facade_를_주입하지_않는다() {
    noClasses()
        .that()
        .resideInAPackage(FACADE)
        .should()
        .dependOnClassesThat()
        .resideInAPackage(FACADE)
        .check(CLASSES);
  }

  @Test
  void R4b_facade_에는_Transactional_이_없다() {
    noClasses()
        .that()
        .resideInAPackage(FACADE)
        .should()
        .beAnnotatedWith(Transactional.class)
        .check(CLASSES);
  }

  @Test
  void R4b_facade_메서드에도_Transactional_이_없다() {
    noMethods()
        .that()
        .areDeclaredInClassesThat()
        .resideInAPackage(FACADE)
        .should()
        .beAnnotatedWith(Transactional.class)
        .check(CLASSES);
  }

  @Test
  void 도메인은_01_구조_문서의_12개_안에만_있다() {
    assertThat(DOMAINS).hasSize(12).doesNotHaveDuplicates();

    assertThat(DOMAINS).containsAll(실제_도메인());
  }

  private static Set<String> 실제_도메인() {
    return CLASSES.stream()
        .map(ArchitectureTest::domainOf)
        .flatMap(Optional::stream)
        .collect(Collectors.toSet());
  }

  @Test
  void R2_조건은_실제로_타_도메인_repository_주입을_잡는다() {
    JavaClasses fixture =
        new ClassFileImporter()
            .importPackages("site.gachijoopging.server.architecture.fixture.violating");

    ArchRule rule =
        classes()
            .that()
            .resideInAPackage("..domain..")
            .should(notReachIntoOtherDomain("repository"));

    assertThatThrownBy(() -> rule.check(fixture))
        .isInstanceOf(AssertionError.class)
        .hasMessageContaining("AlphaService");
  }

  @Test
  void R2_조건은_같은_도메인_안의_repository_참조는_허용한다() {
    JavaClasses fixture =
        new ClassFileImporter()
            .importPackages("site.gachijoopging.server.architecture.fixture.compliant");

    classes()
        .that()
        .resideInAPackage("..domain..")
        .should(notReachIntoOtherDomain("repository"))
        .check(fixture);
  }

  private static Set<String> domainsHavingPackageSegment(String segment) {
    return CLASSES.stream()
        .filter(javaClass -> javaClass.getPackageName().contains(segment))
        .map(ArchitectureTest::domainOf)
        .flatMap(Optional::stream)
        .collect(Collectors.toSet());
  }

  private static ArchCondition<JavaClass> notReachIntoOtherDomain(String layer) {
    return new ArchCondition<>("다른 도메인의 " + layer + " 를 사용하지 않는다") {
      @Override
      public void check(JavaClass origin, ConditionEvents events) {
        Optional<String> originDomain = domainOf(origin);
        if (originDomain.isEmpty()) {
          return;
        }
        origin
            .getDirectDependenciesFromSelf()
            .forEach(
                dependency -> {
                  JavaClass target = dependency.getTargetClass();
                  Optional<String> targetDomain = domainOf(target);
                  boolean violates =
                      targetDomain.isPresent()
                          && !targetDomain.equals(originDomain)
                          && target.getPackageName().contains("." + layer)
                          && !isQuerydslGenerated(target)
                          && !target.isEnum();
                  if (violates) {
                    events.add(
                        SimpleConditionEvent.violated(
                            origin,
                            origin.getFullName() + " 가 " + target.getFullName() + " 에 의존한다"));
                  }
                });
      }
    };
  }

  private static boolean isQuerydslGenerated(JavaClass target) {
    return QUERYDSL_GENERATED.matcher(target.getSimpleName()).matches();
  }

  private static Optional<String> domainOf(JavaClass javaClass) {
    Matcher matcher = DOMAIN_SEGMENT.matcher(javaClass.getPackageName() + ".");
    return matcher.find() ? Optional.of(matcher.group(1)) : Optional.empty();
  }
}
