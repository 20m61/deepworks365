.PHONY: validate security bicep issues-dry-run setup

setup:
	./scripts/setup-dev.sh

validate:
	./scripts/validate-repo.sh

security:
	./scripts/run-security.sh

bicep:
	az bicep build --file infra/main.bicep --stdout >/dev/null

issues-dry-run:
	DRY_RUN=1 ./scripts/create-issues.sh
