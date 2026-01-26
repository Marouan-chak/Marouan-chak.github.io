---
title: "CI/CD Pipelines for Crossplane Functions"
description: "You've built a Python composition function. It works locally. Now you need to deploy it reliably—build container images, run tests, and push to registries..."
date: 2026-01-24
series: "crossplane-python-blog-posts"
series_title: "Crossplane Python Functions"
part: 8
cover_image: "/blog/crossplane-python-blog-posts/images/covers/part-08-cover.png"
tags:
  - blog
  - crossplane-python-blog-posts
permalink: /blog/crossplane-python-blog-posts/part-08/
layout: layouts/blog.njk
---

# CI/CD Pipelines for Crossplane Functions

**Crossplane Python Functions | Part 8**

*Building a production multi-cloud platform with Python*

---

You've built a Python composition function. It works locally. Now you need to deploy it reliably—build container images, run tests, and push to registries automatically.

This post covers production-ready CI/CD pipelines for Crossplane functions using GitHub Actions.

## What We're Building

A complete pipeline that:

1. **Runs unit tests** on every push
2. **Validates with `crossplane beta render`** to catch composition errors
3. **Builds multi-platform images** for amd64 and arm64
4. **Pushes to private registries** (GCP Artifact Registry, AWS ECR, or Azure ACR)
5. **Creates Crossplane packages** (.xpkg files)
6. **Supports semantic versioning** with Git tags

![CI and CD pipeline diagram for testing and deploying Crossplane Python composition functions](/blog/crossplane-python-blog-posts/images/diagrams/part-08-cicd-pipeline.png)

## Repository Structure

```
function-myplatform/
├── .github/
│   └── workflows/
│       ├── ci.yaml           # Test on PR
│       ├── build-push.yaml   # Build and push on merge
│       └── release.yaml      # Release on tag
├── myplatform/
│   ├── __init__.py
│   ├── core.py
│   ├── resources/
│   └── function.py
├── function/
│   └── main.py
├── tests/
│   ├── test_composition.py
│   └── fixtures/
├── examples/
│   ├── claim.yaml
│   ├── composition.yaml
│   └── functions.yaml
├── package/
│   └── crossplane.yaml
├── Dockerfile
├── pyproject.toml
└── hatch.toml
```

## Workflow 1: CI on Pull Requests

Run tests and validation on every PR:

```yaml
# .github/workflows/ci.yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: pip install hatch

      - name: Run linting
        run: hatch run lint:all

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: pip install hatch

      - name: Run unit tests
        run: hatch run test:unit

      - name: Run integration tests
        run: hatch run test:integration

  render-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: pip install hatch

      - name: Install Crossplane CLI
        run: |
          curl -sL https://raw.githubusercontent.com/crossplane/crossplane/master/install.sh | sh
          sudo mv crossplane /usr/local/bin/

      - name: Start function server
        run: |
          hatch run development &
          sleep 5

      - name: Test GCP render
        run: |
          crossplane beta render \
            examples/gcp/claim.yaml \
            apis/cluster/composition.yaml \
            examples/functions.yaml \
            -e examples/envconfigs/ \
            -r

      - name: Test AWS render
        run: |
          crossplane beta render \
            examples/aws/claim.yaml \
            apis/cluster/composition.yaml \
            examples/functions.yaml \
            -e examples/envconfigs/ \
            -r

      - name: Test Azure render
        run: |
          crossplane beta render \
            examples/azure/claim.yaml \
            apis/cluster/composition.yaml \
            examples/functions.yaml \
            -e examples/envconfigs/ \
            -r
```

## Workflow 2: Build and Push on Merge

Build images when PRs are merged to main:

```yaml
# .github/workflows/build-push.yaml
name: Build and Push

on:
  push:
    branches: [main]

env:
  REGISTRY: us-docker.pkg.dev
  PROJECT_ID: my-project
  REPOSITORY: crossplane-functions
  IMAGE_NAME: function-myplatform

jobs:
  build-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write  # For Workload Identity

    steps:
      - uses: actions/checkout@v4

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      # GCP Authentication with Workload Identity
      - name: Authenticate to Google Cloud
        id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: projects/${{ env.PROJECT_NUMBER }}/locations/global/workloadIdentityPools/github/providers/github
          service_account: github-actions@${{ env.PROJECT_ID }}.iam.gserviceaccount.com

      - name: Configure Docker for Artifact Registry
        run: |
          gcloud auth configure-docker ${{ env.REGISTRY }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Install Crossplane CLI
        run: |
          curl -sL https://raw.githubusercontent.com/crossplane/crossplane/master/install.sh | sh
          sudo mv crossplane /usr/local/bin/

      - name: Build Crossplane package
        run: |
          crossplane xpkg build \
            -f package/ \
            --embed-runtime-image=${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            -o function-myplatform-${{ github.sha }}.xpkg

      - name: Push Crossplane package
        run: |
          crossplane xpkg push \
            -f function-myplatform-${{ github.sha }}.xpkg \
            ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
```

## Workflow 3: Release on Tag

Create versioned releases:

```yaml
# .github/workflows/release.yaml
name: Release

on:
  push:
    tags:
      - 'v*'

env:
  REGISTRY: us-docker.pkg.dev
  PROJECT_ID: my-project
  REPOSITORY: crossplane-functions
  IMAGE_NAME: function-myplatform

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: projects/${{ env.PROJECT_NUMBER }}/locations/global/workloadIdentityPools/github/providers/github
          service_account: github-actions@${{ env.PROJECT_ID }}.iam.gserviceaccount.com

      - name: Configure Docker
        run: gcloud auth configure-docker ${{ env.REGISTRY }}

      - name: Extract version
        id: version
        run: echo "VERSION=${GITHUB_REF#refs/tags/v}" >> $GITHUB_OUTPUT

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ steps.version.outputs.VERSION }}
            ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Install Crossplane CLI
        run: |
          curl -sL https://raw.githubusercontent.com/crossplane/crossplane/master/install.sh | sh
          sudo mv crossplane /usr/local/bin/

      - name: Build Crossplane package
        run: |
          crossplane xpkg build \
            -f package/ \
            --embed-runtime-image=${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ steps.version.outputs.VERSION }} \
            -o function-myplatform-${{ steps.version.outputs.VERSION }}.xpkg

      - name: Push Crossplane package
        run: |
          crossplane xpkg push \
            -f function-myplatform-${{ steps.version.outputs.VERSION }}.xpkg \
            ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ steps.version.outputs.VERSION }}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: function-myplatform-${{ steps.version.outputs.VERSION }}.xpkg
          generate_release_notes: true
```

## Authentication Options

### GCP Artifact Registry with Workload Identity

```yaml
# Recommended: Workload Identity (no long-lived credentials)
- name: Authenticate to Google Cloud
  uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github
    service_account: github-actions@PROJECT_ID.iam.gserviceaccount.com

- name: Configure Docker
  run: gcloud auth configure-docker us-docker.pkg.dev
```

Setup in GCP:
```bash
# Create workload identity pool
gcloud iam workload-identity-pools create github \
  --location=global \
  --display-name="GitHub Actions"

# Create provider
gcloud iam workload-identity-pools providers create-oidc github \
  --location=global \
  --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository"

# Grant permissions
gcloud iam service-accounts add-iam-policy-binding \
  github-actions@PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/Marouan-chak/function-myplatform"
```

### AWS ECR with OIDC

```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::ACCOUNT_ID:role/github-actions
    aws-region: us-east-1

- name: Login to Amazon ECR
  uses: aws-actions/amazon-ecr-login@v2
```

### Azure ACR with Workload Identity

```yaml
- name: Azure login
  uses: azure/login@v1
  with:
    client-id: ${{ secrets.AZURE_CLIENT_ID }}
    tenant-id: ${{ secrets.AZURE_TENANT_ID }}
    subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

- name: Login to ACR
  run: az acr login --name myregistry
```

## The Dockerfile

Optimized multi-stage build:

```dockerfile
# Build stage
FROM python:3.11-slim AS builder

WORKDIR /app

# Install build dependencies
RUN pip install --no-cache-dir hatch

# Copy project files
COPY pyproject.toml hatch.toml ./
COPY myplatform/ myplatform/
COPY function/ function/

# Build the wheel
RUN hatch build

# Runtime stage
FROM python:3.11-slim

WORKDIR /app

# Install runtime dependencies only
COPY --from=builder /app/dist/*.whl /tmp/
RUN pip install --no-cache-dir /tmp/*.whl && rm /tmp/*.whl

# Copy entrypoint
COPY function/main.py .

# Run as non-root user
RUN useradd -r -u 1000 function
USER function

EXPOSE 9443

ENTRYPOINT ["python", "main.py"]
```

## Package Metadata

Configure `package/crossplane.yaml`:

```yaml
apiVersion: meta.pkg.crossplane.io/v1
kind: Function
metadata:
  name: function-myplatform
  annotations:
    meta.crossplane.io/maintainer: Platform Team <platform@example.com>
    meta.crossplane.io/source: https://github.com/Marouan-chak/function-myplatform
    meta.crossplane.io/description: |
      Multi-cloud platform composition function supporting GCP, AWS, and Azure.
    meta.crossplane.io/readme: |
      This function creates cloud-agnostic Kubernetes clusters and supporting
      infrastructure across GCP, AWS, and Azure.
spec:
  crossplane:
    version: ">=1.14.0"
```

## Version Management

### Semantic Versioning

Use Git tags for versions:

```bash
# Create version tag
git tag v1.0.0
git push origin v1.0.0

# This triggers the release workflow
```

### Automatic Version Bumping

```yaml
# .github/workflows/bump-version.yaml
name: Bump Version

on:
  workflow_dispatch:
    inputs:
      bump:
        description: 'Version bump type'
        required: true
        default: 'patch'
        type: choice
        options:
          - patch
          - minor
          - major

jobs:
  bump:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Get current version
        id: current
        run: |
          VERSION=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
          echo "VERSION=${VERSION#v}" >> $GITHUB_OUTPUT

      - name: Bump version
        id: bump
        run: |
          IFS='.' read -r major minor patch <<< "${{ steps.current.outputs.VERSION }}"
          case "${{ inputs.bump }}" in
            major) major=$((major + 1)); minor=0; patch=0 ;;
            minor) minor=$((minor + 1)); patch=0 ;;
            patch) patch=$((patch + 1)) ;;
          esac
          echo "VERSION=${major}.${minor}.${patch}" >> $GITHUB_OUTPUT

      - name: Create tag
        run: |
          git config user.name github-actions
          git config user.email github-actions@github.com
          git tag v${{ steps.bump.outputs.VERSION }}
          git push origin v${{ steps.bump.outputs.VERSION }}
```

## Testing in CI

### Unit Tests

```python
# tests/test_composition.py
import pytest
from myplatform.core import add_definition
from myplatform.resources.bucket import add_bucket

def test_add_bucket_gcp():
    """Test GCP bucket creation."""
    composition = MockComposition(cloud="gcp")

    add_bucket(
        composition=composition,
        name="test-bucket",
        external_name="my-bucket",
        force_destroy=True,
    )

    # Verify bucket was added
    assert "test-bucket" in composition.rsp.desired.resources
    resource = composition.rsp.desired.resources["test-bucket"].resource
    assert resource["apiVersion"] == "storage.gcp.upbound.io/v1beta2"
```

### Render Tests

```yaml
# In CI workflow
- name: Test render produces expected resources
  run: |
    OUTPUT=$(crossplane beta render \
      examples/gcp/claim.yaml \
      apis/cluster/composition.yaml \
      examples/functions.yaml \
      -e examples/envconfigs/)

    # Verify expected resources exist
    echo "$OUTPUT" | grep -q "kind: Cluster"
    echo "$OUTPUT" | grep -q "kind: NodePool"
    echo "$OUTPUT" | grep -q "kind: Release"
```

## Promotion Strategy

### Environment Branches

```
main          -> dev registry
release/v1.x  -> staging registry
tags v*       -> production registry
```

### Workflow per Environment

```yaml
# Deploy to dev on push to main
on:
  push:
    branches: [main]
env:
  REGISTRY: dev-registry.example.com

---

# Deploy to staging on release branch
on:
  push:
    branches: [release/*]
env:
  REGISTRY: staging-registry.example.com

---

# Deploy to prod on tags
on:
  push:
    tags: [v*]
env:
  REGISTRY: prod-registry.example.com
```

## Monitoring Builds

### Slack Notifications

```yaml
- name: Notify Slack on failure
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    channel-id: 'C0123456789'
    slack-message: |
      Build failed for ${{ github.repository }}
      Commit: ${{ github.sha }}
      Author: ${{ github.actor }}
      <${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Run>
  env:
    SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```

### Build Status Badge

Add to README.md:

```markdown
![Build Status](https://github.com/Marouan-chak/function-myplatform/workflows/CI/badge.svg)
```

![Screenshot of GitHub Actions workflow run](/blog/crossplane-python-blog-posts/images/screenshots/part-08-github-actions.png)

## Key Takeaways

- **Run `crossplane beta render` in CI** to catch composition errors early
- **Use multi-platform builds** (amd64 + arm64) for broad compatibility
- **Workload Identity** avoids long-lived credentials in CI
- **Semantic versioning with tags** triggers release builds
- **Cache Docker layers** with `cache-from: type=gha` for faster builds
- **Separate workflows** for CI, build, and release keeps concerns clear

## Next Up

In Part 9, we'll explore importing existing infrastructure—how to adopt cloud resources that weren't created by Crossplane using observe and manage modes.

---

*Written by [Marouan Chakran](https://marouan.net), Senior SRE and Platform Engineer, building multi-cloud platforms with Crossplane and Python.*

**Part 8 of 10** | Previous: [Helm Templating with Jinja2](part-07-helm-templating-jinja2.md) | Next: [Importing Existing Infrastructure](part-09-importing-existing-infrastructure.md)

Companion repository: [github.com/Marouan-chak/crossplane-python-blog-series](https://github.com/Marouan-chak/crossplane-python-blog-series)

**Tags**: crossplane, platform-engineering, kubernetes, python, devops