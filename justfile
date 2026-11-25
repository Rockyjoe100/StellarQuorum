# Thin wrapper around Makefile for contributors who prefer `just`
# All recipes are defined in Makefile; this file simply delegates to make.
# Run `make help` or `just --list` to see available recipes.

default:
    @just --list

# Delegate all recipes to make
[private]
_make *args:
    @make {{args}}

# High-level workflows
build: _make build
lint: _make lint
test: _make test
audit: _make audit
check: _make check
ci: _make ci
clean: _make clean

# Per-package build shortcuts
build-contracts: _make build-contracts
build-sdk: _make build-sdk
build-frontend: _make build-frontend

# Per-package lint shortcuts
lint-contracts: _make lint-contracts
lint-frontend: _make lint-frontend
lint-sdk: _make lint-sdk
clippy: _make clippy

# Per-package test shortcuts
test-contracts: _make test-contracts
test-frontend: _make test-frontend
test-sdk: _make test-sdk

# Per-package audit shortcuts
audit-contracts: _make audit-contracts
audit-frontend: _make audit-frontend
audit-sdk: _make audit-sdk

# Verification shortcuts
check-wasm-size: _make check-wasm-size
