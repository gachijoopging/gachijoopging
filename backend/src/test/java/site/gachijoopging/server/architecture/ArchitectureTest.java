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
          "friend",
          "safety",
          "neighborhood",
          "media",
          "activity",
          "post",
          "notification",
          "meet",
          "chat",
          "live",
          "admin");

  private static final Pattern QUERYDSL_GENERATED = Pattern.compile("Q[A-Z]\\w*");

  // feature 안쪽 레이어는 바깥 `server.domain` 과 이름이 겹친다. `*` 로 feature 한 칸을 소비해
  // `server.domain.<feature>.domain` 만 잡는다 — `..domain..` 은 feature 코드 전부를 삼킨다.
  private static final String API = "..domain.*.api..";
  private static final String APPLICATION = "..domain.*.application..";
  private static final String CORE = "..domain.*.domain..";
  private static final String INFRASTRUCTURE = "..domain.*.infrastructure..";
  private static final String PERSISTENCE = "..domain.*.infrastructure.persistence..";
  private static final String EXTERNAL_CLIENT = "..domain.*.infrastructure.client..";
  private static final String ENTITY = "..domain.*.domain.entity..";

  @Test
  void L0_모든_도메인이_api_와_infrastructure_를_갖는다() {
    Set<String> apiOwners = domainsHavingPackageSegment(".api.");
    Set<String> infraOwners = domainsHavingPackageSegment(".infrastructure.");

    assertThat(apiOwners).containsExactlyInAnyOrderElementsOf(DOMAINS);
    assertThat(infraOwners).containsExactlyInAnyOrderElementsOf(DOMAINS);
  }

  @Test
  void L1_api_는_영속을_직접_부르지_않는다() {
    noClasses()
        .that()
        .resideInAPackage(API)
        .should()
        .dependOnClassesThat()
        .resideInAPackage(PERSISTENCE)
        .check(CLASSES);
  }

  @Test
  void L1_api_는_엔티티를_노출하지_않는다() {
    noClasses()
        .that()
        .resideInAPackage(API)
        .should()
        .dependOnClassesThat(
            JavaClass.Predicates.resideInAPackage(ENTITY)
                .and(DescribedPredicate.not(JavaClass.Predicates.ENUMS)))
        .check(CLASSES);
  }

  @Test
  void L2_domain_은_api_와_application_을_모른다() {
    noClasses()
        .that()
        .resideInAPackage(CORE)
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage(API, APPLICATION)
        .check(CLASSES);
  }

  @Test
  void L2b_application_은_엔티티를_모른다() {
    noClasses()
        .that()
        .resideInAPackage(APPLICATION)
        .should()
        .dependOnClassesThat(
            JavaClass.Predicates.resideInAPackage(ENTITY)
                .and(DescribedPredicate.not(JavaClass.Predicates.ENUMS)))
        .check(CLASSES);
  }

  @Test
  void L3b_policy_와_entity_는_infrastructure_전체를_모른다() {
    noClasses()
        .that()
        .resideInAnyPackage("..domain.*.domain.policy..", ENTITY)
        .should()
        .dependOnClassesThat()
        .resideInAPackage(INFRASTRUCTURE)
        .check(CLASSES);
  }

  @Test
  void L3_domain_은_외부_시스템_어댑터를_모른다() {
    noClasses()
        .that()
        .resideInAPackage(CORE)
        .should()
        .dependOnClassesThat()
        .resideInAPackage(EXTERNAL_CLIENT)
        .check(CLASSES);
  }

  @Test
  void L4_infrastructure_는_api_를_모른다() {
    noClasses()
        .that()
        .resideInAPackage(INFRASTRUCTURE)
        .should()
        .dependOnClassesThat()
        .resideInAPackage(API)
        .check(CLASSES);
  }

  @Test
  void R2_타_도메인_infrastructure_를_주입하지_않는다() {
    classes()
        .that()
        .resideInAPackage("..domain..")
        .should(notReachIntoOtherDomain("infrastructure"))
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
  void R4a_조립은_조립을_주입하지_않는다() {
    noClasses()
        .that()
        .resideInAPackage(APPLICATION)
        .should()
        .dependOnClassesThat()
        .resideInAPackage(APPLICATION)
        .check(CLASSES);
  }

  @Test
  void R4b_조립에는_Transactional_이_없다() {
    noClasses()
        .that()
        .resideInAPackage(APPLICATION)
        .should()
        .beAnnotatedWith(Transactional.class)
        .check(CLASSES);
  }

  @Test
  void R4b_조립_메서드에도_Transactional_이_없다() {
    noMethods()
        .that()
        .areDeclaredInClassesThat()
        .resideInAPackage(APPLICATION)
        .should()
        .beAnnotatedWith(Transactional.class)
        .check(CLASSES);
  }

  @Test
  void 도메인_목록은_01구조_문서의_13개다() {
    assertThat(DOMAINS).hasSize(13).doesNotHaveDuplicates();

    Set<String> 실제 =
        CLASSES.stream()
            .map(ArchitectureTest::domainOf)
            .flatMap(Optional::stream)
            .collect(Collectors.toSet());

    assertThat(실제).containsExactlyInAnyOrderElementsOf(DOMAINS);
  }

  @Test
  void R2_조건은_실제로_타_도메인_infrastructure_주입을_잡는다() {
    JavaClasses fixture =
        new ClassFileImporter()
            .importPackages("site.gachijoopging.server.architecture.fixture.violating");

    ArchRule rule =
        classes()
            .that()
            .resideInAPackage("..domain..")
            .should(notReachIntoOtherDomain("infrastructure"));

    assertThatThrownBy(() -> rule.check(fixture))
        .isInstanceOf(AssertionError.class)
        .hasMessageContaining("AlphaService");
  }

  @Test
  void R2_조건은_같은_도메인_안의_infrastructure_참조는_허용한다() {
    JavaClasses fixture =
        new ClassFileImporter()
            .importPackages("site.gachijoopging.server.architecture.fixture.compliant");

    classes()
        .that()
        .resideInAPackage("..domain..")
        .should(notReachIntoOtherDomain("infrastructure"))
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
