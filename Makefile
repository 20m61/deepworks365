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
	az bicep build --file infra/main.bicep --stdout >/dev/null

issues-dry-run:
	DRY_RUN=1 ./scripts/create-issues.sh
