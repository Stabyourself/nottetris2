#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

export TAG="${1:-latest}"

# Accept only the tags CI pushes, so a mistyped tag stops here instead of at docker pull
if [[ ! "$TAG" =~ ^(latest|sha-[0-9a-f]{40})$ ]]; then
	echo "Bad image tag '$TAG': expected latest or sha-<full commit hash>" >&2
	exit 1
fi

for file in compose.yaml .env; do
	if [ ! -f "$file" ]; then
		echo "Missing $(pwd)/$file (copy compose.yaml from the repo; create .env from .env.example)" >&2
		exit 1
	fi
done

# The container runs as the `node` user (uid 1000) and needs to write the database
mkdir -p data
[ "$(stat -c %u data)" = 1000 ] || chown 1000:1000 data

echo "Deploying ghcr.io/gdainti/nottetris2-web:${TAG}"
docker compose -f compose.yaml pull
docker compose -f compose.yaml up -d --wait --wait-timeout 60
docker image prune -f

echo 'Deployment complete!'
