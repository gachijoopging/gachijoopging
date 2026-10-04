package site.gachijoopging.server.domain.auth.client;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Properties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.mail.MailSenderAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mail.javamail.JavaMailSender;

class SmtpMailBootConfigTest {

  @Test
  @DisplayName("application.yml 의 spring.mail 설정만으로 JavaMailSender 가 자동구성된다")
  void javaMailSender_는_packaged_설정으로_자동구성된다() {
    YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
    yaml.setResources(new ClassPathResource("application.yml"));
    Properties props = yaml.getObject();

    String[] mailProps =
        props.stringPropertyNames().stream()
            .filter(key -> key.startsWith("spring.mail."))
            .map(key -> key + "=" + props.getProperty(key))
            .toArray(String[]::new);

    new ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(MailSenderAutoConfiguration.class))
        .withPropertyValues(mailProps)
        .run(context -> assertThat(context).hasSingleBean(JavaMailSender.class));
  }
}
