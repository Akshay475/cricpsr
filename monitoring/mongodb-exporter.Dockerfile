FROM percona/mongodb_exporter:0.47.0 AS exporter

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libc6 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=exporter /mongodb_exporter /usr/local/bin/mongodb_exporter
USER 65535:65535
EXPOSE 9216
ENTRYPOINT ["/usr/local/bin/mongodb_exporter"]
