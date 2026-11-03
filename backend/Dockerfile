# 숨비 백엔드 이미지 (운영: arm64 / t4g.small, 로컬: 내 컴퓨터 아키텍처)
# 빌드 단계는 빌드하는 컴퓨터의 아키텍처($BUILDPLATFORM)에서 돌려 빠르게 (jar 는 아키텍처와 무관),
# 마지막 단계에는 RUN 이 없어서 다른 아키텍처(QEMU)로 만들어도 느리지 않음.

FROM --platform=$BUILDPLATFORM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle gradle
RUN ./gradlew --no-daemon dependencies > /dev/null
COPY src src
RUN ./gradlew --no-daemon bootJar -x test

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/build/libs/sumbi-backend.jar app.jar
# root 가 아닌 사용자로 실행 (숫자 UID: 이미지 안에서 계정을 만들 RUN 이 필요 없음)
USER 10001:10001
ENV SPRING_PROFILES_ACTIVE=prod \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+ExitOnOutOfMemoryError"
EXPOSE 8080
# exec 형식: docker stop 의 SIGTERM 이 자바로 바로 감 → 접속자에게 1012(서버 재시작) 신호 후 종료
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
