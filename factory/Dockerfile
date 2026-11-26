# Agentic Factory image.
#
# Build from the REPO ROOT so the image carries the factory and the built pai-orbit plugin from
# the same commit (that is what keeps prompts single-sourced):
#
#   docker build -f factory/Dockerfile -t orbit-factory .
#
FROM node:22-bookworm-slim

# git: workspaces. gh: GitHub board and code host. python3 + bash: orbit's bash-guard hook.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates curl gnupg python3 bash \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

# The agent CLI. Pin a version for reproducible runs: --build-arg CLAUDE_CODE_VERSION=2.1.308
ARG CLAUDE_CODE_VERSION=latest
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} && npm cache clean --force

# The agent CLI refuses to skip permission prompts as root, and nothing here needs root.
RUN useradd --create-home --shell /bin/bash factory \
 && mkdir -p /data /config \
 && chown -R factory:factory /data /config

WORKDIR /opt/orbit
COPY --chown=factory:factory factory/ factory/
COPY --chown=factory:factory plugins/pai-orbit/dist/claude-code/ plugins/pai-orbit/dist/claude-code/
# A Windows checkout can leave CRLF line endings in the hook scripts, which bash cannot run.
RUN sed -i 's/\r$//' plugins/pai-orbit/dist/claude-code/hooks/*.sh \
 && chmod +x plugins/pai-orbit/dist/claude-code/hooks/*.sh \
 && sed -i 's/\r$//' factory/bin/factory.js \
 && chmod +x factory/bin/factory.js \
 && ln -s /opt/orbit/factory/bin/factory.js /usr/local/bin/orbit-factory

USER factory
# A repo mounted from the host (a local bare repo for a trial) is owned by another user, and git
# refuses such repos by default. This container exists only to run the factory, so trust them.
RUN git config --global --add safe.directory '*'
ENV FACTORY_SANDBOXED=1 \
    FACTORY_DATA_DIR=/data \
    FACTORY_CONFIG=/config/factory.config.json \
    CLAUDE_CONFIG_DIR=/data/claude \
    DISABLE_AUTOUPDATER=1 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

# State, audit trail, workspaces and agent sessions all live here. Mount a volume.
VOLUME ["/data"]

# The read-only status page (`orbit-factory ui`, or `run` with ui.enabled).
EXPOSE 8080

ENTRYPOINT ["node", "/opt/orbit/factory/bin/factory.js"]
CMD ["run"]
