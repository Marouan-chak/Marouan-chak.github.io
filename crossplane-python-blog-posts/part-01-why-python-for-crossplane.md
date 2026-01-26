---
title: "Why Python for Crossplane Compositions?"
description: "If you've worked with Crossplane, you know the feeling: your compositions start clean, then requirements multiply. Conditional logic. Cloud-specific..."
date: 2026-01-17
series: "crossplane-python-blog-posts"
series_title: "Crossplane Python Functions"
part: 1
cover_image: "/blog/crossplane-python-blog-posts/images/covers/part-01-cover.webp"
tags:
  - blog
  - crossplane-python-blog-posts
permalink: /blog/crossplane-python-blog-posts/part-01/
layout: layouts/blog.njk
---

# Why Python for Crossplane Compositions?

**Crossplane Python Functions | Part 1**

*Building a production multi-cloud platform with Python*

---

If you've worked with Crossplane, you know the feeling: your compositions start clean, then requirements multiply. Conditional logic. Cloud-specific variations. Dynamic resource counts. Before long, you're staring at hundreds of lines of YAML patches that nobody wants to touch.

There's a better way. Crossplane composition functions let you write your infrastructure logic in real programming languages—including Python. This series will show you how to build a production-grade, multi-cloud platform that deploys Kubernetes clusters to GCP, AWS, or Azure from a single claim interface.

But before we write any code, let's understand why Python composition functions exist and why they're worth learning.

## The Evolution of Crossplane Compositions

Crossplane compositions have evolved through three distinct phases, each addressing limitations of the previous approach.

### Phase 1: Patch and Transform (The YAML Era)

The original composition model used declarative patches to transform claims into managed resources. You'd write something like:

```yaml
patches:
  - type: FromCompositeFieldPath
    fromFieldPath: spec.parameters.region
    toFieldPath: spec.forProvider.region
  - type: CombineFromComposite
    combine:
      variables:
        - fromFieldPath: metadata.name
        - fromFieldPath: spec.parameters.environment
      strategy: string
      string:
        fmt: "%s-%s-bucket"
    toFieldPath: metadata.name
```

This works for simple cases. But compositions quickly become unwieldy when you need:

- **Conditional resources**: Create a NAT gateway only if the cluster is private
- **Dynamic counts**: Generate N node pools based on user input
- **Cloud-specific logic**: GKE uses `location`, EKS uses `region`
- **Complex transformations**: Parse CIDR blocks, calculate subnets

The patch-and-transform model forces you to encode programming logic in YAML. The result is compositions that are hard to read, harder to test, and nearly impossible to debug.

![Diagram comparing YAML patch-based Crossplane compositions with Python composition functions generating managed resources](/blog/crossplane-python-blog-posts/images/diagrams/part-01-yaml-vs-python.webp)

### Phase 2: Composition Functions (The Polyglot Era)

Crossplane 1.14 introduced composition functions—arbitrary code that runs during reconciliation. Functions receive the current state and return desired resources. They can be written in any language that implements the gRPC protocol.

This opened possibilities. Suddenly you could write:

```python
if composition.cloud == "gcp":
    add_gke_cluster(composition)
elif composition.cloud == "aws":
    add_eks_cluster(composition)
elif composition.cloud == "azure":
    add_aks_cluster(composition)
```

Real programming constructs. Conditionals. Loops. Functions. Variables with meaningful names.

### Phase 3: Python SDK (The Developer Experience Era)

The Crossplane team released official SDKs for Go and Python, making function development accessible to platform engineers who don't want to wrestle with protocol buffers directly.

The Python SDK (`crossplane-function-sdk-python`) handles the gRPC plumbing and provides typed helpers for building responses. You write Python; the SDK handles serialization.

This is where we are today—and where this series begins.

## Why Python Beats the Alternatives

You could write composition functions in Go. Or Rust. Or any language with gRPC support. So why Python?

### 1. Familiarity for Platform Engineers

Most platform engineers already know Python. It's the lingua franca of DevOps tooling, from Ansible to AWS CDK to infrastructure testing frameworks. Your team can contribute to compositions without learning a new language.

### 2. Rich Ecosystem

Python's package ecosystem is unmatched for infrastructure work:

- **Jinja2** for templating Helm values
- **PyYAML** for YAML manipulation
- **pydash** for deep dictionary operations
- **pytest** for unit testing compositions
- **mypy** for type checking

You're not starting from scratch—you're leveraging decades of library development.

### 3. Rapid Iteration

Python's interpreted nature means faster development cycles:

```bash
# Start the development server
hatch run development

# Test changes immediately
crossplane beta render claim.yaml composition.yaml functions.yaml -r
```

No compilation step. No Docker rebuilds during development. Change code, re-render, see results.

### 4. Readable Business Logic

Compare expressing "create a node pool for each entry in the pools map" in YAML patches versus Python:

```python
for pool_name, pool_config in composition.pools.items():
    add_nodepool(
        composition=c,
        name=f"pool-{pool_name}",
        template={"spec": {"forProvider": pool_config}},
        uses=["cluster"],
    )
```

This reads like what it does. Six months from now, you'll understand it instantly.

### 5. Testability

Python compositions are testable with standard tools:

```python
def test_cluster_creates_nodepool_per_entry():
    claim = load_claim("fixtures/multi-pool-claim.yaml")
    result = render_composition(claim)

    nodepools = [r for r in result if r["kind"] == "NodePool"]
    assert len(nodepools) == 3
    assert nodepools[0]["metadata"]["name"] == "pool-default"
```

Unit tests catch regressions before they reach clusters.

## What You'll Build: A Multi-Cloud Cluster Platform

This series isn't theoretical. We'll build a real platform that:

1. **Accepts a single claim format** for Kubernetes clusters
2. **Deploys to GCP, AWS, or Azure** based on a label
3. **Handles cloud-specific resources** automatically (VPCs, IAM, networking)
4. **Installs Helm charts** with dynamic values
5. **Supports importing existing infrastructure** without recreation
6. **Runs in CI/CD** with automated testing

By the end, you'll have a production-ready codebase and the knowledge to extend it.

### The Power of One Function, Three Clouds

Here's the end result. A user creates this claim:

```yaml
apiVersion: myplatform.io/v1alpha1
kind: Cluster
metadata:
  name: my-cluster
  labels:
    cloud: gcp  # or aws, or azure
spec:
  parameters:
    domain: my-cluster.example.com
  forProvider:
    location: us-central1
  pools:
    default:
      nodeConfig:
        machineType: e2-medium
```

The same composition function interprets this claim and produces:

- **For GCP**: GKE cluster, node pools, Cloud DNS zones, Workload Identity bindings
- **For AWS**: EKS cluster, managed node groups, Route53 zones, IRSA configuration
- **For Azure**: AKS cluster, agent pools, Azure DNS zones, Workload Identity

One interface. Three completely different cloud implementations. Zero YAML patches.

## Series Roadmap

Here's what's coming:

| Part | Topic | What You'll Learn |
|------|-------|-------------------|
| 1 | Why Python | You are here |
| 2 | First Function | Scaffold, build, deploy, test |
| 3 | Function I/O | Request/response structures |
| 4 | 3-Layer Pattern | Multi-cloud architecture |
| 5 | Dynamic Discovery | Python introspection magic |
| 6 | EnvironmentConfigs | Configuration management |
| 7 | Helm Templating | Jinja2 for dynamic values |
| 8 | CI/CD Pipelines | Production deployment |
| 9 | Import Workflow | Adopting existing infrastructure |
| 10 | Production Build | Full multi-cloud implementation |

Each post includes working code in the companion repository: `crossplane-python-blog-series`.

## Prerequisites

To follow along, you'll need:

- **Kubernetes cluster** with Crossplane installed (v1.14+)
- **Python 3.11+** with Hatch for environment management
- **Docker** for building function images
- **Crossplane CLI** for local testing
- **Basic familiarity** with Kubernetes and YAML

Cloud accounts (GCP, AWS, Azure) are helpful for later parts but not required for local development.

## Key Takeaways

- **Composition functions replace YAML patches** with real programming logic
- **Python offers the best developer experience** for platform engineers
- **Multi-cloud platforms become maintainable** when you can use conditionals, loops, and functions
- **This series builds a production system**, not toy examples

## Next Up

In Part 2, we'll scaffold your first Python composition function, deploy it to a cluster, and test it locally with `crossplane beta render`. You'll go from zero to a working function in under an hour.

---

*Written by [Marouan Chakran](https://marouan.net), Senior SRE and Platform Engineer, building multi-cloud platforms with Crossplane and Python.*

**Part 1 of 10** | Next: [Your First Python Composition Function](part-02-your-first-python-function.md)

Companion repository: [github.com/Marouan-chak/crossplane-python-blog-series](https://github.com/Marouan-chak/crossplane-python-blog-series)

**Tags**: crossplane, platform-engineering, kubernetes, python, devops