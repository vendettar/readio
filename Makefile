.DEFAULT_GOAL := help

CLOUD_DOCKER_CONTEXT ?= readio-cloud
CLOUD_COMPOSE_FILE ?= docker-compose.readio.yml
KEEP_RECENT_IMAGES ?= 5
DRY_RUN ?= 0

.NOTPARALLEL:

CLOUD_CONTEXT_VARS := CLOUD_SSH_HOST CLOUD_SSH_PORT CLOUD_SSH_USER
CLOUD_DEPLOY_VARS := REPO_OWNER IMAGE_TAG
CLOUD_ISOLATION_VARS := IMAGE_NAME CONTAINER_NAME HOST_PORT APP_PORT DATA_DIR COMPOSE_PROJECT_NAME
CLOUD_RUNTIME_SECRET_VARS := \
	READIO_ADMIN_TOKEN \
	PODCAST_INDEX_API_KEY \
	PODCAST_INDEX_API_SECRET \
	READIO_ASR_WORKER_SHARED_SECRET \
	READIO_GRAFANA_OTLP_TOKEN
CLOUD_RUNTIME_NON_SECRET_VARS := \
	READIO_ASR_ALLOWED_ORIGINS \
	READIO_DISCOVERY_ALLOWED_ORIGINS \
	READIO_PROXY_ALLOWED_ORIGINS \
	READIO_GRAFANA_OTLP_ENDPOINT \
	READIO_GRAFANA_OTLP_INSTANCE_ID \
	READIO_TRUSTED_PROXY_CIDRS \
	READIO_ASR_WORKER_BASE_URL
CLOUD_BROWSER_PUBLIC_VARS := \
	READIO_ASR_RELAY_PUBLIC_TOKEN \
	READIO_EN_DICTIONARY_API_URL \
	READIO_EN_DICTIONARY_API_TRANSPORT \
	VITE_GRAFANA_FARO_URL \
	VITE_GRAFANA_FARO_APP_NAME \
	VITE_GRAFANA_FARO_ENV \
	VITE_GRAFANA_FARO_SAMPLE_RATE

CLOUD_COMMON_REQUIRED_VARS := \
	$(CLOUD_CONTEXT_VARS) \
	$(CLOUD_DEPLOY_VARS) \
	$(CLOUD_ISOLATION_VARS) \
	$(CLOUD_RUNTIME_SECRET_VARS) \
	$(CLOUD_RUNTIME_NON_SECRET_VARS) \
	$(CLOUD_BROWSER_PUBLIC_VARS)

export $(CLOUD_CONTEXT_VARS)
export $(CLOUD_DEPLOY_VARS)
export $(CLOUD_ISOLATION_VARS)
export $(CLOUD_RUNTIME_SECRET_VARS)
export $(CLOUD_RUNTIME_NON_SECRET_VARS)
export $(CLOUD_BROWSER_PUBLIC_VARS)

PRE_COMPOSE_PROJECT_NAME := readio-pre
PRE_CONTAINER_NAME := readio-api-pre
PRE_HOST_PORT := 8079
PRE_APP_PORT := 8080
PRE_DATA_DIR := /etc/readio/pre/data
PRE_IMAGE_NAME := readio-cloud-api-pre

PROD_COMPOSE_PROJECT_NAME := readio-prod
PROD_CONTAINER_NAME := readio-api-prod
PROD_HOST_PORT := 8080
PROD_APP_PORT := 8080
PROD_DATA_DIR := /etc/readio/prod/data
PROD_IMAGE_NAME := readio-cloud-api-prod

check-env-pre deploy-pre: IMAGE_NAME := $(PRE_IMAGE_NAME)
check-env-pre deploy-pre: CONTAINER_NAME := $(PRE_CONTAINER_NAME)
check-env-pre deploy-pre: HOST_PORT := $(PRE_HOST_PORT)
check-env-pre deploy-pre: APP_PORT := $(PRE_APP_PORT)
check-env-pre deploy-pre: DATA_DIR := $(PRE_DATA_DIR)
check-env-pre deploy-pre: COMPOSE_PROJECT_NAME := $(PRE_COMPOSE_PROJECT_NAME)

check-env-prod deploy-prod: IMAGE_NAME := $(PROD_IMAGE_NAME)
check-env-prod deploy-prod: CONTAINER_NAME := $(PROD_CONTAINER_NAME)
check-env-prod deploy-prod: HOST_PORT := $(PROD_HOST_PORT)
check-env-prod deploy-prod: APP_PORT := $(PROD_APP_PORT)
check-env-prod deploy-prod: DATA_DIR := $(PROD_DATA_DIR)
check-env-prod deploy-prod: COMPOSE_PROJECT_NAME := $(PROD_COMPOSE_PROJECT_NAME)

.PHONY: \
	help \
	check-env-context \
	check-env-image-repo \
	check-env-pre \
	check-env-prod \
	context-setup \
	deploy-pre \
	deploy-prod \
	logs-pre \
	logs-prod \
	prune-images-pre \
	prune-images-prod

help:
	@printf '%s\n' 'Readio Cloud deployment targets:'
	@printf '  %-24s %s\n' 'make check-env-pre' 'validate preproduction deployment variables'
	@printf '  %-24s %s\n' 'make check-env-prod' 'validate production deployment variables'
	@printf '  %-24s %s\n' 'make context-setup' 'create/update the Docker SSH context'
	@printf '  %-24s %s\n' 'make deploy-pre' 'deploy preproduction through Docker Context'
	@printf '  %-24s %s\n' 'make deploy-prod CONFIRM=deploy' 'deploy production through Docker Context'
	@printf '  %-24s %s\n' 'make logs-pre' 'follow preproduction logs'
	@printf '  %-24s %s\n' 'make logs-prod' 'follow production logs'
	@printf '  %-24s %s\n' 'make prune-images-pre' 'remove old preproduction API images'
	@printf '  %-24s %s\n' 'make prune-images-prod' 'remove old production API images'

check-env-context:
	@missing='$(strip $(foreach var,$(CLOUD_CONTEXT_VARS),$(if $(value $(var)),,$(var))))'; \
	if [ -n "$$missing" ]; then \
		printf '%s\n' 'Missing required variables:' >&2; \
		for var in $$missing; do printf '  %s\n' "$$var" >&2; done; \
		exit 1; \
	fi

check-env-image-repo:
	@missing='$(strip $(foreach var,REPO_OWNER,$(if $(value $(var)),,$(var))))'; \
	if [ -n "$$missing" ]; then \
		printf '%s\n' 'Missing required variables:' >&2; \
		for var in $$missing; do printf '  %s\n' "$$var" >&2; done; \
		exit 1; \
	fi

check-env-pre:
	@missing='$(strip $(foreach var,$(CLOUD_COMMON_REQUIRED_VARS),$(if $(value $(var)),,$(var))))'; \
	if [ -n "$$missing" ]; then \
		printf '%s\n' 'Missing required variables:' >&2; \
		for var in $$missing; do printf '  %s\n' "$$var" >&2; done; \
		exit 1; \
	fi

check-env-prod:
	@missing='$(strip $(foreach var,$(CLOUD_COMMON_REQUIRED_VARS),$(if $(value $(var)),,$(var))))'; \
	if [ -n "$$missing" ]; then \
		printf '%s\n' 'Missing required variables:' >&2; \
		for var in $$missing; do printf '  %s\n' "$$var" >&2; done; \
		exit 1; \
	fi

context-setup: check-env-context
	@if [ "$(DRY_RUN)" = "1" ]; then \
		printf '%s\n' 'docker context inspect $(CLOUD_DOCKER_CONTEXT)'; \
		printf '%s\n' 'docker context create $(CLOUD_DOCKER_CONTEXT) --docker host=ssh://$(CLOUD_SSH_USER)@$(CLOUD_SSH_HOST):$(CLOUD_SSH_PORT)'; \
		printf '%s\n' 'docker context update $(CLOUD_DOCKER_CONTEXT) --docker host=ssh://$(CLOUD_SSH_USER)@$(CLOUD_SSH_HOST):$(CLOUD_SSH_PORT)'; \
	else \
		if docker context inspect '$(CLOUD_DOCKER_CONTEXT)' >/dev/null 2>&1; then \
			docker context update '$(CLOUD_DOCKER_CONTEXT)' --docker 'host=ssh://$(CLOUD_SSH_USER)@$(CLOUD_SSH_HOST):$(CLOUD_SSH_PORT)'; \
		else \
			docker context create '$(CLOUD_DOCKER_CONTEXT)' --docker 'host=ssh://$(CLOUD_SSH_USER)@$(CLOUD_SSH_HOST):$(CLOUD_SSH_PORT)'; \
		fi; \
	fi

deploy-pre: check-env-pre context-setup
	@if [ "$(DRY_RUN)" = "1" ]; then \
		printf '%s\n' 'docker --context $(CLOUD_DOCKER_CONTEXT) compose -f $(CLOUD_COMPOSE_FILE) -p $(PRE_COMPOSE_PROJECT_NAME) pull'; \
		printf '%s\n' 'docker --context $(CLOUD_DOCKER_CONTEXT) compose -f $(CLOUD_COMPOSE_FILE) -p $(PRE_COMPOSE_PROJECT_NAME) up -d --wait --remove-orphans'; \
	else \
		docker --context '$(CLOUD_DOCKER_CONTEXT)' compose -f '$(CLOUD_COMPOSE_FILE)' -p '$(COMPOSE_PROJECT_NAME)' pull; \
		docker --context '$(CLOUD_DOCKER_CONTEXT)' compose -f '$(CLOUD_COMPOSE_FILE)' -p '$(COMPOSE_PROJECT_NAME)' up -d --wait --remove-orphans; \
	fi

deploy-prod:
	@if [ "$(CONFIRM)" != "deploy" ]; then \
		printf '%s\n' 'Refusing production deployment: rerun with CONFIRM=deploy.' >&2; \
		exit 1; \
	fi
	@$(MAKE) --no-print-directory check-env-prod
	@$(MAKE) --no-print-directory context-setup
	@if [ "$(DRY_RUN)" = "1" ]; then \
		printf '%s\n' 'docker --context $(CLOUD_DOCKER_CONTEXT) compose -f $(CLOUD_COMPOSE_FILE) -p $(PROD_COMPOSE_PROJECT_NAME) pull'; \
		printf '%s\n' 'docker --context $(CLOUD_DOCKER_CONTEXT) compose -f $(CLOUD_COMPOSE_FILE) -p $(PROD_COMPOSE_PROJECT_NAME) up -d --wait --remove-orphans'; \
	else \
		docker --context '$(CLOUD_DOCKER_CONTEXT)' compose -f '$(CLOUD_COMPOSE_FILE)' -p '$(COMPOSE_PROJECT_NAME)' pull; \
		docker --context '$(CLOUD_DOCKER_CONTEXT)' compose -f '$(CLOUD_COMPOSE_FILE)' -p '$(COMPOSE_PROJECT_NAME)' up -d --wait --remove-orphans; \
	fi

logs-pre: check-env-context context-setup
	@docker --context '$(CLOUD_DOCKER_CONTEXT)' logs -f '$(PRE_CONTAINER_NAME)'

logs-prod: check-env-context context-setup
	@docker --context '$(CLOUD_DOCKER_CONTEXT)' logs -f '$(PROD_CONTAINER_NAME)'

prune-images-pre: check-env-context check-env-image-repo context-setup
	@CLOUD_DOCKER_CONTEXT='$(CLOUD_DOCKER_CONTEXT)' \
	IMAGE_REPO='ghcr.io/$(REPO_OWNER)/$(PRE_IMAGE_NAME)' \
	KEEP_RECENT_IMAGES='$(KEEP_RECENT_IMAGES)' \
	DRY_RUN='$(DRY_RUN)' \
		scripts/readio-cloud-prune-images.sh

prune-images-prod: check-env-context check-env-image-repo context-setup
	@CLOUD_DOCKER_CONTEXT='$(CLOUD_DOCKER_CONTEXT)' \
	IMAGE_REPO='ghcr.io/$(REPO_OWNER)/$(PROD_IMAGE_NAME)' \
	KEEP_RECENT_IMAGES='$(KEEP_RECENT_IMAGES)' \
	DRY_RUN='$(DRY_RUN)' \
		scripts/readio-cloud-prune-images.sh
