# The published controller has a single AMD64 manifest. Its bundled Java
# application is architecture-neutral, so copy that immutable release into a
# native JVM image instead of running the controller through emulation.
ARG DATA_PIPES_SOURCE_IMAGE=itechuw/ohs-fhir-data-pipes-controller:sha-3d3656e@sha256:2f9caef7c3c940f8a0e1241551213954c1ea205371166eb8f1d40bd0311fda1a
ARG DATA_PIPES_SOURCE_PLATFORM=linux/amd64
FROM --platform=${DATA_PIPES_SOURCE_PLATFORM} ${DATA_PIPES_SOURCE_IMAGE} AS controller_source

FROM eclipse-temurin:17-jre-jammy@sha256:ec72ba5962b45ae4e7f96bfb5ebf6eeb34a488b967f937c8e14f0aaec688954f

ENV FLINK_CONF_DIR=/app/config
WORKDIR /app

RUN apt-get update \
    && apt-get install --no-install-recommends -y libjemalloc2 python3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=controller_source /app/controller-bundled.jar /app/controller-bundled.jar
COPY fhir-data-pipes-entrypoint.sh /docker-entrypoint.sh
RUN chmod 755 /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
