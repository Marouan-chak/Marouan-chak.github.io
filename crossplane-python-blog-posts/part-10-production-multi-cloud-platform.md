---
title: "Building a Production Multi-Cloud Cluster Platform"
description: "Throughout this series, we've learned individual techniques: the 3-layer pattern, dynamic provider discovery, environment configs, Jinja2 templating, CI/CD..."
date: 2026-01-26
series: "crossplane-python-blog-posts"
series_title: "Crossplane Python Functions"
part: 10
cover_image: "/blog/crossplane-python-blog-posts/images/covers/part-10-cover.png"
tags:
  - blog
  - crossplane-python-blog-posts
permalink: /blog/crossplane-python-blog-posts/part-10/
layout: layouts/blog.njk
---

# Building a Production Multi-Cloud Cluster Platform

**Crossplane Python Functions | Part 10**

*Building a production multi-cloud platform with Python*

---

Throughout this series, we've learned individual techniques: the 3-layer pattern, dynamic provider discovery, environment configs, Jinja2 templating, CI/CD pipelines, and import workflows. Now we bring them all together.

This final post walks through a production-ready composition function that deploys Kubernetes clusters to GCP, AWS, or Azure from a single claim interface.

## What We're Building

A platform that accepts this claim:

```yaml
apiVersion: myplatform.io/v1alpha1
kind: Cluster
metadata:
  name: prod-cluster
  labels:
    cloud: gcp        # or aws, or azure
    planeId: my-project-123
    planeType: production
spec:
  parameters:
    domain: prod.example.com
    createDnsZones: true
  forProvider:
    location: us-central1
  pools:
    default:
      autoscaling:
        minNodeCount: 3
        maxNodeCount: 10
      nodeConfig:
        machineType: e2-standard-4
```

And produces:

- **Cloud-native Kubernetes cluster** (GKE, EKS, or AKS)
- **Node pools** with autoscaling
- **Networking** (VPC, subnets, NAT)
- **DNS zones** (public and private)
- **Provider configs** for Helm and Kubernetes
- **Helm releases** (cert-manager, ingress-nginx, monitoring)
- **Workload Identity** bindings

![High level architecture of a production multi cloud Kubernetes platform built using Crossplane Python composition functions](/blog/crossplane-python-blog-posts/images/diagrams/part-10-platform-architecture.png)

## Project Structure

```
function-cluster-platform/
├── myplatform/
│   ├── __init__.py
│   ├── core.py                    # add_definition(), helpers
│   ├── compositions/
│   │   ├── base.py               # Composition base class
│   │   └── cluster.py            # ClusterComposition
│   ├── resources/
│   │   ├── cluster.py            # Agnostic cluster
│   │   ├── nodepool.py           # Agnostic nodepool
│   │   ├── dns.py                # Agnostic DNS
│   │   ├── helm.py               # Helm releases
│   │   ├── gcp/
│   │   │   ├── cluster.py
│   │   │   ├── nodepool.py
│   │   │   └── dns.py
│   │   ├── aws/
│   │   │   ├── cluster.py
│   │   │   ├── nodepool.py
│   │   │   └── dns.py
│   │   └── azure/
│   │       ├── cluster.py
│   │       ├── nodepool.py
│   │       └── dns.py
│   └── import_manager.py         # Import workflow
├── function/
│   ├── main.py                   # gRPC entry point
│   └── cluster/
│       ├── cluster.py            # Main deployment logic
│       └── import_cluster.py     # Import workflow
├── apis/
│   └── cluster/
│       ├── definition.yaml       # XRD
│       └── composition.yaml      # Composition
├── examples/
│   ├── envconfigs/
│   ├── gcp/
│   ├── aws/
│   └── azure/
├── tests/
├── package/
│   └── crossplane.yaml
├── Dockerfile
└── pyproject.toml
```

## The XRD (Composite Resource Definition)

```yaml
# apis/cluster/definition.yaml
apiVersion: apiextensions.crossplane.io/v1
kind: CompositeResourceDefinition
metadata:
  name: xclusters.myplatform.io
spec:
  group: myplatform.io
  names:
    kind: XCluster
    plural: xclusters
  claimNames:
    kind: Cluster
    plural: clusters
  versions:
    - name: v1alpha1
      served: true
      referenceable: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                parameters:
                  type: object
                  properties:
                    domain:
                      type: string
                      description: Primary domain for the cluster
                    createDnsZones:
                      type: boolean
                      default: true
                    import:
                      type: object
                      properties:
                        enabled:
                          type: boolean
                        mode:
                          type: string
                          enum: [observe, manage]
                        resources:
                          type: object
                forProvider:
                  type: object
                  properties:
                    location:
                      type: string
                pools:
                  type: object
                  additionalProperties:
                    type: object
            status:
              type: object
              properties:
                clusterEndpoint:
                  type: string
                clusterCA:
                  type: string
```

## The Composition

```yaml
# apis/cluster/composition.yaml
apiVersion: apiextensions.crossplane.io/v1
kind: Composition
metadata:
  name: xclusters.myplatform.io
spec:
  compositeTypeRef:
    apiVersion: myplatform.io/v1alpha1
    kind: XCluster
  environment:
    environmentConfigs:
      - type: Selector
        selector:
          matchLabels:
            - key: baseline
              type: Value
              value: default
      - type: Selector
        selector:
          matchLabels:
            - key: cloud
              type: FromCompositeFieldPath
              valueFromFieldPath: metadata.labels[cloud]
      - type: Selector
        selector:
          matchLabels:
            - key: planeType
              type: FromCompositeFieldPath
              valueFromFieldPath: metadata.labels[planeType]
  mode: Pipeline
  pipeline:
    - step: cluster-platform
      functionRef:
        name: function-cluster-platform
      input:
        apiVersion: myplatform.io/v1alpha1
        kind: Input
        module: cluster
```

## The ClusterComposition Class

```python
# myplatform/compositions/cluster.py

from dataclasses import dataclass
from pydash import get
from .base import Composition

@dataclass
class ClusterComposition(Composition):
    """Composition class for Kubernetes clusters."""

    def __post_init__(self):
        super().__post_init__()

        # Cluster identity
        self.cluster = self.labels.get("clusterName", self.name)
        self.plane = self.labels.get("planeId", "")
        self.ns = self.labels.get("crossplane.io/claim-namespace", "default")

        # Domain configuration
        self.domain = self.params.get("domain", "")
        self.create_dns = self.params.get("createDnsZones", True) and bool(self.domain)

        # Node pools from spec
        self.pools = self.params.get("pools", {})
        if not self.pools:
            # Default pool if none specified
            self.pools = {
                "default": {
                    "nodeConfig": {"machineType": self.env.get("defaultMachineType", "e2-medium")},
                    "autoscaling": {"minNodeCount": 1, "maxNodeCount": 3},
                }
            }

        # Networking from environment
        self.network = get(self.env, "network", {})
        self.subnet_cidr = get(self.network, "subnetCidr", "10.0.0.0/24")
        self.pods_cidr = get(self.network, "podsCidr", "10.1.0.0/16")
        self.services_cidr = get(self.network, "servicesCidr", "10.2.0.0/16")

    @property
    def is_private(self) -> bool:
        """Whether this is a private cluster."""
        return self.params.get("privateCluster", True)

    @property
    def has_monitoring(self) -> bool:
        """Whether monitoring is enabled."""
        return get(self.env, "monitoring.enabled", True)
```

## Main Deployment Logic

```python
# function/cluster/cluster.py

import myplatform as myplatform
from myplatform import ClusterComposition
from myplatform.import_manager import is_import_enabled
from .import_cluster import deploy_import_cluster

def deploy_cluster(c: ClusterComposition):
    """Main entry point for cluster deployment."""

    # Check for import workflow
    if is_import_enabled(c):
        c.log.info("Import mode detected")
        deploy_import_cluster(c)
        return

    # Normal deployment flow
    c.log.info(f"Deploying cluster {c.cluster} on {c.cloud}")

    # Core infrastructure
    deploy_networking(c)
    deploy_cluster_resources(c)
    deploy_node_pools(c)

    # DNS if requested
    if c.create_dns:
        deploy_dns(c)

    # Provider configs for accessing the cluster
    deploy_provider_configs(c)

    # Applications
    deploy_helm_releases(c)

    # Update XR status
    update_xr_status(c)

    c.log.info(f"Cluster {c.cluster} deployment complete")

def deploy_networking(c: ClusterComposition):
    """Deploy VPC, subnets, NAT (if private)."""
    c.log.info("Deploying networking")

    myplatform.add_network(
        composition=c,
        name="network",
        external_name=f"{c.cluster}-vpc",
    )

    myplatform.add_subnetwork(
        composition=c,
        name="subnet",
        external_name=f"{c.cluster}-subnet",
        template={
            "spec": {
                "forProvider": {
                    "ipCidrRange": c.subnet_cidr,
                    "secondaryIpRanges": [
                        {"rangeName": "pods", "ipCidrRange": c.pods_cidr},
                        {"rangeName": "services", "ipCidrRange": c.services_cidr},
                    ],
                }
            }
        },
        uses=["network"],
    )

    if c.is_private:
        myplatform.add_router(
            composition=c,
            name="router",
            external_name=f"{c.cluster}-router",
            uses=["network"],
        )

        myplatform.add_nat(
            composition=c,
            name="nat",
            external_name=f"{c.cluster}-nat",
            uses=["router"],
        )

def deploy_cluster_resources(c: ClusterComposition):
    """Deploy the Kubernetes cluster."""
    c.log.info(f"Deploying {c.cloud} cluster")

    myplatform.add_cluster(
        composition=c,
        name="cluster",
        external_name=c.cluster,
        template={
            "spec": {
                "forProvider": c.for_provider,
                "writeConnectionSecretToRef": {
                    "namespace": c.ns,
                    "name": f"cluster.{c.cluster}",
                },
            }
        },
        uses=["subnet"],
    )

def deploy_node_pools(c: ClusterComposition):
    """Deploy node pools."""
    c.log.info(f"Deploying {len(c.pools)} node pools")

    for pool_name, pool_config in c.pools.items():
        myplatform.add_nodepool(
            composition=c,
            name=f"nodepool-{pool_name}",
            external_name=f"{c.cluster}-{pool_name}",
            template={"spec": {"forProvider": pool_config}},
            uses=["cluster"],
        )

def deploy_dns(c: ClusterComposition):
    """Deploy DNS zones and records."""
    c.log.info(f"Deploying DNS for {c.domain}")

    # Public zone
    myplatform.add_dns_zone(
        composition=c,
        name="public_dns_zone",
        external_name=c.domain.replace(".", "-"),
        template={
            "spec": {
                "forProvider": {
                    "dnsName": f"{c.domain}.",
                    "visibility": "public",
                }
            }
        },
    )

    # Private zone (for internal services)
    if c.is_private:
        myplatform.add_dns_zone(
            composition=c,
            name="private_dns_zone",
            external_name=f"{c.domain.replace('.', '-')}-private",
            template={
                "spec": {
                    "forProvider": {
                        "dnsName": f"internal.{c.domain}.",
                        "visibility": "private",
                    }
                }
            },
            uses=["network"],
        )

def deploy_provider_configs(c: ClusterComposition):
    """Deploy Helm and Kubernetes provider configs."""
    c.log.info("Deploying provider configs")

    # Helm provider config
    myplatform.add_helm_providerconfig(
        composition=c,
        name="helm_providerconfig",
        uses=["cluster"],
    )

    # Kubernetes provider config
    myplatform.add_k8s_providerconfig(
        composition=c,
        name="k8s_providerconfig",
        uses=["cluster"],
    )

def deploy_helm_releases(c: ClusterComposition):
    """Deploy Helm charts based on environment config."""
    c.log.info("Deploying Helm releases")

    charts = c.env.get("charts", {})

    # cert-manager
    if not charts.get("cert-manager", {}).get("disabled"):
        add_cert_manager(c)

    # ingress-nginx
    if not charts.get("ingress-nginx", {}).get("disabled"):
        add_ingress_nginx(c)

    # monitoring stack
    if c.has_monitoring and not charts.get("monitoring", {}).get("disabled"):
        add_monitoring_stack(c)

def add_cert_manager(c: ClusterComposition):
    """Deploy cert-manager."""
    from myplatform.resources.helm import HelmRelease, add_helm_release

    config = c.env.get("charts", {}).get("cert-manager", {})

    add_helm_release(
        release=HelmRelease(
            name="cert-manager",
            repo="https://charts.jetstack.io",
            version=config.get("version", "v1.14.0"),
            values="""
installCRDs: true
prometheus:
  enabled: {{ monitoring.enabled | default(true) }}
""",
        ),
        providerconfig_resource="helm_providerconfig",
        composition=c,
        name="helm-cert-manager",
        uses=["helm_providerconfig"],
    )

def add_ingress_nginx(c: ClusterComposition):
    """Deploy ingress-nginx with cloud-specific annotations."""
    from myplatform.resources.helm import HelmRelease, add_helm_release

    config = c.env.get("charts", {}).get("ingress-nginx", {})

    add_helm_release(
        release=HelmRelease(
            name="ingress-nginx",
            repo="https://kubernetes.github.io/ingress-nginx",
            version=config.get("version", "4.9.0"),
            values="""
controller:
  replicaCount: {{ ingress_replicas | default(2) }}
  service:
    annotations:
{% if cloud == "gcp" %}
      cloud.google.com/load-balancer-type: "Internal"
{% elif cloud == "aws" %}
      service.beta.kubernetes.io/aws-load-balancer-scheme: "internal"
{% elif cloud == "azure" %}
      service.beta.kubernetes.io/azure-load-balancer-internal: "true"
{% endif %}
  metrics:
    enabled: {{ monitoring.enabled | default(true) }}
""",
        ),
        providerconfig_resource="helm_providerconfig",
        composition=c,
        name="helm-ingress-nginx",
        uses=["helm_providerconfig", "helm-cert-manager"],
    )

def add_monitoring_stack(c: ClusterComposition):
    """Deploy Prometheus/Grafana stack."""
    from myplatform.resources.helm import HelmRelease, add_helm_release

    config = c.env.get("charts", {}).get("monitoring", {})

    add_helm_release(
        release=HelmRelease(
            name="kube-prometheus-stack",
            repo="https://prometheus-community.github.io/helm-charts",
            version=config.get("version", "56.0.0"),
            namespace="monitoring",
            values="""
prometheus:
  prometheusSpec:
    retention: {{ monitoring.retention | default("30d") }}
grafana:
  enabled: true
  adminPassword: {{ monitoring.grafana.admin_password | default("admin") }}
alertmanager:
  enabled: true
""",
        ),
        providerconfig_resource="helm_providerconfig",
        composition=c,
        name="helm-monitoring",
        uses=["helm_providerconfig"],
    )

def update_xr_status(c: ClusterComposition):
    """Update XR status with cluster info."""
    from myplatform.core import get_status_field

    endpoint = get_status_field(c.observed, "cluster", "endpoint")
    ca_cert = get_status_field(c.observed, "cluster", "certificateAuthority")

    if endpoint:
        c.desired.composite.resource["status"] = {
            "clusterEndpoint": endpoint,
            "clusterCA": ca_cert,
        }
```

## Cloud-Specific Implementations

### GCP Cluster

```python
# myplatform/resources/gcp/cluster.py

from myplatform.core import Resource

api_version = "container.gcp.upbound.io/v1beta2"

def add_cluster(r: Resource):
    """GKE cluster configuration."""
    return {
        "apiVersion": api_version,
        "spec": {
            "forProvider": {
                "project": r.composition.plane,
                "location": r.composition.location,
                "deletionProtection": False,
                "initialNodeCount": 1,
                "removeDefaultNodePool": True,
                "workloadIdentityConfig": {
                    "workloadPool": f"{r.composition.plane}.svc.id.goog",
                },
                "privateClusterConfig": {
                    "enablePrivateNodes": r.composition.is_private,
                    "masterIpv4CidrBlock": "172.16.0.0/28",
                },
            }
        },
    }
```

### AWS Cluster

```python
# myplatform/resources/aws/cluster.py

from myplatform.core import Resource, add_usage, update_response

api_version = "eks.aws.upbound.io/v1beta1"

def add_cluster(r: Resource):
    """EKS cluster configuration."""
    return {
        "apiVersion": api_version,
        "spec": {
            "forProvider": {
                "region": r.composition.location,
                "roleArn": f"arn:aws:iam::{r.composition.plane}:role/eks-cluster-role",
                "vpcConfig": {
                    "endpointPrivateAccess": r.composition.is_private,
                    "endpointPublicAccess": not r.composition.is_private,
                },
            }
        },
    }

def add_cluster_extra(r: Resource):
    """AWS needs ClusterAuth for kubeconfig."""
    add_cluster_auth(r)
    add_usage(r.composition, of="cluster_auth", by=r.name)

def add_cluster_auth(r: Resource):
    """Export kubeconfig via ClusterAuth."""
    cluster_auth = {
        "apiVersion": api_version,
        "kind": "ClusterAuth",
        "spec": {
            "forProvider": {
                "region": r.composition.location,
                "clusterName": r.external_name,
            },
            "writeConnectionSecretToRef": {
                "namespace": r.composition.ns,
                "name": r.external_name,
            },
        },
    }
    update_response(r.composition, "cluster_auth", cluster_auth)
```

### Azure Cluster

```python
# myplatform/resources/azure/cluster.py

from myplatform.core import Resource

api_version = "containerservice.azure.upbound.io/v1beta1"

def add_cluster(r: Resource):
    """AKS cluster configuration."""
    return {
        "apiVersion": api_version,
        "spec": {
            "forProvider": {
                "resourceGroupName": r.composition.plane,
                "location": r.composition.location,
                "dnsPrefix": r.external_name,
                "identity": {
                    "type": "SystemAssigned",
                },
                "defaultNodePool": {
                    "name": "system",
                    "nodeCount": 1,
                    "vmSize": "Standard_D2_v2",
                },
                "networkProfile": {
                    "networkPlugin": "azure",
                    "networkPolicy": "calico",
                },
            }
        },
    }
```

## Environment Configs

```yaml
# examples/envconfigs/defaults.yaml
apiVersion: apiextensions.crossplane.io/v1alpha1
kind: EnvironmentConfig
metadata:
  name: defaults
  labels:
    baseline: default
data:
  defaultMachineType: e2-medium
  monitoring:
    enabled: true
    retention: 30d
  charts:
    cert-manager:
      version: v1.14.0
    ingress-nginx:
      version: "4.9.0"
---

# examples/envconfigs/cloud.gcp.yaml
apiVersion: apiextensions.crossplane.io/v1alpha1
kind: EnvironmentConfig
metadata:
  name: cloud.gcp
  labels:
    cloud: gcp
data:
  defaultMachineType: e2-standard-4
  defaultRegion: us-central1
---

# examples/envconfigs/planetype.production.yaml
apiVersion: apiextensions.crossplane.io/v1alpha1
kind: EnvironmentConfig
metadata:
  name: planetype.production
  labels:
    planeType: production
data:
  monitoring:
    retention: 90d
  ingress_replicas: 3
```

## Testing the Platform

### Local Development

```bash
# Terminal 1: Start dev server
hatch run development

# Terminal 2: Test GCP cluster
crossplane beta render \
  examples/gcp/claim.yaml \
  apis/cluster/composition.yaml \
  examples/functions.yaml \
  -e examples/envconfigs/ \
  -r

# Test AWS cluster
crossplane beta render \
  examples/aws/claim.yaml \
  apis/cluster/composition.yaml \
  examples/functions.yaml \
  -e examples/envconfigs/ \
  -r

# Test Azure cluster
crossplane beta render \
  examples/azure/claim.yaml \
  apis/cluster/composition.yaml \
  examples/functions.yaml \
  -e examples/envconfigs/ \
  -r
```

### Verify Output

```bash
# Count resources by kind
crossplane beta render ... | grep "^kind:" | sort | uniq -c

# Check cloud-specific resources appear
crossplane beta render examples/gcp/claim.yaml ... | grep "container.gcp"
crossplane beta render examples/aws/claim.yaml ... | grep "eks.aws"
crossplane beta render examples/azure/claim.yaml ... | grep "containerservice.azure"
```

## Deployment

### Build and Push

```bash
# Build multi-platform image
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t us-docker.pkg.dev/myproject/functions/cluster-platform:v1.0.0 \
  --push .

# Build Crossplane package
crossplane xpkg build \
  -f package/ \
  --embed-runtime-image=us-docker.pkg.dev/myproject/functions/cluster-platform:v1.0.0 \
  -o function-cluster-platform-v1.0.0.xpkg

# Push package
crossplane xpkg push \
  -f function-cluster-platform-v1.0.0.xpkg \
  us-docker.pkg.dev/myproject/functions/cluster-platform:v1.0.0
```

### Install on Cluster

```bash
# Install the function
kubectl apply -f - <<EOF
apiVersion: pkg.crossplane.io/v1beta1
kind: Function
metadata:
  name: function-cluster-platform
spec:
  package: us-docker.pkg.dev/myproject/functions/cluster-platform:v1.0.0
EOF

# Install the XRD and Composition
kubectl apply -f apis/cluster/definition.yaml
kubectl apply -f apis/cluster/composition.yaml

# Install environment configs
kubectl apply -f examples/envconfigs/
```

### Create a Cluster

```bash
# Apply claim
kubectl apply -f - <<EOF
apiVersion: myplatform.io/v1alpha1
kind: Cluster
metadata:
  name: my-prod-cluster
  namespace: default
  labels:
    cloud: gcp
    planeId: my-gcp-project
    planeType: production
spec:
  parameters:
    domain: prod.mycompany.com
  forProvider:
    location: us-central1
  pools:
    default:
      autoscaling:
        minNodeCount: 3
        maxNodeCount: 10
      nodeConfig:
        machineType: e2-standard-4
EOF

# Watch progress
kubectl get cluster my-prod-cluster -w
```

![Screenshot of cluster creation terminal output](/blog/crossplane-python-blog-posts/images/screenshots/part-10-cluster-creation.png)

```bash
# Check managed resources
crossplane beta trace cluster my-prod-cluster
```

## Summary: What We Built

Over this 10-part series, we've built:

1. **Part 1**: Understood why Python is ideal for composition functions
2. **Part 2**: Scaffolded and deployed our first function
3. **Part 3**: Mastered function I/O and built a Composition class
4. **Part 4**: Implemented the 3-layer pattern for multi-cloud
5. **Part 5**: Used Python introspection for dynamic provider discovery
6. **Part 6**: Managed configuration with EnvironmentConfigs
7. **Part 7**: Templated Helm values with Jinja2
8. **Part 8**: Built CI/CD pipelines for automated deployment
9. **Part 9**: Imported existing infrastructure safely
10. **Part 10**: Assembled everything into a production platform

The result: A single Python function that deploys production Kubernetes clusters to any major cloud provider from one unified interface.

## What's Next

- Add more resource types (databases, queues, storage)
- Implement cost estimation
- Add policy enforcement
- Build a web UI for cluster creation
- Extend to additional clouds (Oracle, DigitalOcean)

The patterns in this series scale to any infrastructure your platform needs.

---

*Written by [Marouan Chakran](https://marouan.net), Senior SRE and Platform Engineer, building multi-cloud platforms with Crossplane and Python.*

**Part 10 of 10** | Previous: [Importing Existing Infrastructure](part-09-importing-existing-infrastructure.md)

Companion repository: [github.com/Marouan-chak/crossplane-python-blog-series](https://github.com/Marouan-chak/crossplane-python-blog-series)

**Tags**: crossplane, platform-engineering, kubernetes, python, devops

---

## Complete Series Index

1. [Why Python for Crossplane Compositions?](part-01-why-python-for-crossplane.md)
2. [Your First Python Composition Function](part-02-your-first-python-function.md)
3. [Understanding Composition Function I/O](part-03-understanding-function-io.md)
4. [The 3-Layer Resource Pattern](part-04-three-layer-resource-pattern.md)
5. [Dynamic Provider Discovery](part-05-dynamic-provider-discovery.md)
6. [Configuration Management with EnvironmentConfigs](part-06-environment-configs.md)
7. [Templating Helm Releases with Jinja2](part-07-helm-templating-jinja2.md)
8. [CI/CD Pipelines for Crossplane Functions](part-08-cicd-pipelines.md)
9. [Importing Existing Infrastructure](part-09-importing-existing-infrastructure.md)
10. [Building a Production Multi-Cloud Cluster Platform](part-10-production-multi-cloud-platform.md) *(this post)*