.PHONY: validate security bicep hooks issues-dry-run setup

setup:
	./scripts/setup-dev.sh

hooks:
	pre-commit run --all-files

validate:
	./scripts/validate-repo.sh

security:
	./scripts/run-security.sh

bicep:
	@if command -v bicep >/dev/null 2>&1; then bicep build infra/main.bicep --stdout >/dev/null; \
	elif command -v az >/dev/null 2>&1; then az bicep build --file infra/main.bicep --stdout >/dev/null; \
	else echo "bicep/az 未導入。scripts/setup-dev.sh を実行してください"; exit 1; fi

issues-dry-run:
	DRY_RUN=1 ./scripts/create-issues.sh
