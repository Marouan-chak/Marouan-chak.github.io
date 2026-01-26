---
title: "Importing Existing Infrastructure"
description: "Your organization has existing cloud infrastructure. GKE clusters created by Terraform. EKS clusters from CDK. Manual resources in the console. You want to..."
date: 2026-01-25
series: "crossplane-python-blog-posts"
series_title: "Crossplane Python Functions"
part: 9
cover_image: "/blog/crossplane-python-blog-posts/images/covers/part-09-cover.png"
tags:
  - blog
  - crossplane-python-blog-posts
permalink: /blog/crossplane-python-blog-posts/part-09/
layout: layouts/blog.njk
---

# Importing Existing Infrastructure

**Crossplane Python Functions | Part 9**

*Building a production multi-cloud platform with Python*

---

Your organization has existing cloud infrastructure. GKE clusters created by Terraform. EKS clusters from CDK. Manual resources in the console. You want to bring them under Crossplane management without destroying and recreating.

This post shows how to implement observe and manage modes for adopting existing infrastructure.

## The Migration Challenge

When you adopt Crossplane, you face a dilemma:

1. **Destroy and recreate** - Downtime, risk, data loss
2. **Parallel infrastructure** - Double costs, drift between systems
3. **Gradual adoption** - Import existing resources into Crossplane

Option 3 is ideal, but requires careful handling of:

- **External names** - Matching Crossplane resources to existing cloud resources
- **Management policies** - Controlling whether Crossplane reads or writes
- **Deletion behavior** - What happens when you delete the Crossplane resource

## Crossplane Management Policies

Crossplane supports granular control over what it does with resources:

### Policy Options

| Policy | Create | Observe | Update | Delete |
|--------|--------|---------|--------|--------|
| `*` (default) | Yes | Yes | Yes | Yes |
| `Observe` | No | Yes | No | No |
| `Create` | Yes | No | No | No |
| `Update` | No | No | Yes | No |
| `Delete` | No | No | No | Yes |
| `LateInitialize` | No | Yes | Auto-fill | No |

### Common Combinations

```yaml
# Observe only - read state, never modify
managementPolicies: ["Observe", "LateInitialize"]
deletionPolicy: Orphan

# Full management - Crossplane controls everything
managementPolicies: ["*"]
deletionPolicy: Delete

# Create but don't update - for immutable resources
managementPolicies: ["Create", "Observe", "LateInitialize"]
deletionPolicy: Delete
```

## Import Workflow Overview

![Sequence diagram showing safe adoption of existing cloud resources using Crossplane import and observe workflows](/blog/crossplane-python-blog-posts/images/diagrams/part-09-import-workflow.png)

1. **Observe mode** - Crossplane reads state, makes no changes
2. **Manage mode** - Crossplane takes control, orphans on delete
3. **Normal mode** - Crossplane creates fresh resources

## Implementing in Python

### Import Configuration Schema

Define how users specify resources to import:

```yaml
apiVersion: myplatform.io/v1alpha1
kind: Cluster
metadata:
  name: existing-cluster
  labels:
    cloud: gcp
spec:
  parameters:
    import:
      enabled: true
      mode: observe  # or "manage"
      resources:
        cluster:
          externalName: my-existing-cluster
        nodePools:
          default:
            externalName: my-existing-pool
        dns:
          public:
            externalName: example-com
            visibility: public
```

### Helper Functions

```python
# myplatform/import_manager.py

from pydash import get
from .core import ResourceDict, add_definition

def get_import_config(composition) -> dict:
    """Extract import configuration from parameters."""
    import_config = get(composition.params, "import", {})
    return import_config if isinstance(import_config, dict) else {}

def is_import_enabled(composition) -> bool:
    """Check if import mode is enabled."""
    import_config = get_import_config(composition)
    return import_config.get("enabled", False)

def get_import_mode(composition) -> str:
    """Get current import mode: 'observe' or 'manage'."""
    import_config = get_import_config(composition)
    return import_config.get("mode", "manage")

def get_import_resources(composition) -> dict:
    """Get mapping of resources to import."""
    import_config = get_import_config(composition)
    return import_config.get("resources", {})

def add_observed_resource(
    definition: dict | str,
    *args,
    external_name: str,
    **r,
) -> None:
    """Add a resource configured for observation only.

    Sets managementPolicies to Observe + LateInitialize,
    and deletionPolicy to Orphan.
    """
    template = r.get("template", {})
    template.setdefault("spec", {})

    # Configure for pure observation
    template["spec"]["managementPolicies"] = ["Observe", "LateInitialize"]
    template["spec"]["deletionPolicy"] = "Orphan"

    r["template"] = template
    add_definition(definition, *args, external_name=external_name, **r)

def add_imported_resource(
    definition: dict | str,
    *args,
    external_name: str,
    **r,
) -> None:
    """Add a resource transitioning to full management.

    Uses default managementPolicies but keeps deletionPolicy Orphan
    for safety during transition.
    """
    template = r.get("template", {})
    template.setdefault("spec", {})

    # Full management but orphan on delete for safety
    template["spec"]["deletionPolicy"] = "Orphan"

    r["template"] = template
    add_definition(definition, *args, external_name=external_name, **r)
```

### Import Deployment Logic

```python
# function/cluster/import_cluster.py

import myplatform
from myplatform.import_manager import (
    add_imported_resource,
    add_observed_resource,
    get_import_mode,
    get_import_resources,
)

def deploy_import_cluster(c):
    """Handle cluster deployment in import modes."""
    mode = get_import_mode(c)
    c.log.info(f"Deploying cluster in import mode: {mode}")

    if mode == "observe":
        observe_existing_cluster(c)
    elif mode == "manage":
        manage_imported_cluster(c)
    else:
        c.log.warning(f"Unknown import mode: {mode}")

def observe_existing_cluster(c):
    """Emit resources configured for observation only."""
    resources = get_import_resources(c)
    c.log.info(f"Observing resources: {list(resources.keys())}")

    # Observe cluster
    if cluster_config := resources.get("cluster"):
        _observe_cluster(c, cluster_config)

    # Observe node pools
    if nodepool_configs := resources.get("nodePools"):
        for pool_name, pool_config in nodepool_configs.items():
            _observe_nodepool(c, pool_name, pool_config)

    # Observe DNS
    if dns_configs := resources.get("dns"):
        for zone_name, zone_config in dns_configs.items():
            _observe_dns_zone(c, zone_name, zone_config)

def _observe_cluster(c, config):
    """Observe an existing cluster."""
    external_name = config.get("externalName")
    if not external_name:
        c.log.warning("Cluster config missing externalName")
        return

    c.log.info(f"Observing cluster: {external_name}")

    add_observed_resource(
        {"apiVersion": "container.gcp.upbound.io/v1beta2", "kind": "Cluster"},
        composition=c,
        name="cluster",
        external_name=external_name,
        template={
            "spec": {
                "forProvider": {
                    "project": c.plane,
                    "location": c.location,
                },
                "writeConnectionSecretToRef": {
                    "namespace": c.ns,
                    "name": f"cluster.{external_name}",
                },
            }
        },
    )

def _observe_nodepool(c, pool_name, config):
    """Observe an existing node pool."""
    external_name = config.get("externalName")
    if not external_name:
        c.log.warning(f"Node pool {pool_name} missing externalName")
        return

    c.log.info(f"Observing node pool: {external_name}")

    add_observed_resource(
        {"apiVersion": "container.gcp.upbound.io/v1beta2", "kind": "NodePool"},
        composition=c,
        name=f"nodepool-{pool_name}",
        external_name=external_name,
        template={
            "spec": {
                "forProvider": {
                    "project": c.plane,
                    "location": c.location,
                    "cluster": c.cluster,
                }
            }
        },
    )

def _observe_dns_zone(c, zone_name, config):
    """Observe an existing DNS zone."""
    external_name = config.get("externalName")
    visibility = config.get("visibility", "public")

    if not external_name:
        c.log.warning(f"DNS zone {zone_name} missing externalName")
        return

    c.log.info(f"Observing {visibility} DNS zone: {external_name}")

    add_observed_resource(
        {"apiVersion": "dns.gcp.upbound.io/v1beta2", "kind": "ManagedZone"},
        composition=c,
        name=f"{visibility}_dns_zone",
        external_name=external_name,
        template={
            "spec": {
                "forProvider": {
                    "project": c.plane,
                    "visibility": visibility,
                }
            }
        },
    )
```

### Manage Mode Implementation

```python
def manage_imported_cluster(c):
    """Emit resources configured for full management."""
    resources = get_import_resources(c)
    c.log.info(f"Managing resources: {list(resources.keys())}")

    # Manage cluster with full spec
    if cluster_config := resources.get("cluster"):
        _manage_cluster(c, cluster_config)

    # Manage node pools with desired config
    if nodepool_configs := resources.get("nodePools"):
        for pool_name, pool_config in nodepool_configs.items():
            _manage_nodepool(c, pool_name, pool_config)

    # After managing core resources, add normal flow components
    from .cluster import add_helm_releases, add_providerconfig

    add_providerconfig(c, "helm")
    add_providerconfig(c, "k8s")
    add_helm_releases(c)

def _manage_cluster(c, config):
    """Take over management of an existing cluster."""
    external_name = config.get("externalName")
    if not external_name:
        return

    c.log.info(f"Managing cluster: {external_name}")

    # Use full forProvider from claim
    add_imported_resource(
        {"apiVersion": "container.gcp.upbound.io/v1beta2", "kind": "Cluster"},
        composition=c,
        name="cluster",
        external_name=external_name,
        template={
            "spec": {
                "forProvider": c.for_provider,
                "writeConnectionSecretToRef": {
                    "namespace": c.ns,
                    "name": f"cluster.{external_name}",
                },
            }
        },
    )

def _manage_nodepool(c, pool_name, config):
    """Take over management of an existing node pool."""
    external_name = config.get("externalName")
    if not external_name:
        return

    c.log.info(f"Managing node pool: {external_name}")

    # Use pool config from claim's pools section
    pool_config = c.pools.get(pool_name, {})

    add_imported_resource(
        {"apiVersion": "container.gcp.upbound.io/v1beta2", "kind": "NodePool"},
        composition=c,
        name=f"nodepool-{pool_name}",
        external_name=external_name,
        template={
            "spec": {
                "forProvider": {
                    "project": c.plane,
                    "location": c.location,
                    "cluster": c.cluster,
                    **pool_config,
                }
            }
        },
    )
```

## Main Entry Point Integration

```python
# function/cluster/cluster.py

from .import_cluster import deploy_import_cluster
from myplatform.import_manager import is_import_enabled

def deploy_cluster(c: ClusterComposition):
    """Main cluster deployment entry point."""

    # Check if this is an import workflow
    if is_import_enabled(c):
        deploy_import_cluster(c)
        return

    # Normal cluster deployment
    deploy_normal_cluster(c)

def deploy_normal_cluster(c: ClusterComposition):
    """Standard cluster deployment flow."""
    myplatform.add_cluster(...)
    myplatform.add_nodepool(...)
    add_helm_releases(c)
    # etc.
```

## Multi-Cloud Import Examples

### GCP (GKE)

```yaml
spec:
  parameters:
    import:
      enabled: true
      mode: observe
      resources:
        cluster:
          externalName: existing-gke-cluster
        nodePools:
          default:
            externalName: existing-gke-cluster-default-pool
```

### AWS (EKS)

```yaml
spec:
  parameters:
    import:
      enabled: true
      mode: observe
      resources:
        cluster:
          externalName: existing-eks-cluster
          forProvider:
            region: us-east-1
        nodePools:
          default:
            externalName: existing-eks-nodegroup
```

### Azure (AKS)

```yaml
spec:
  parameters:
    import:
      enabled: true
      mode: observe
      resources:
        cluster:
          externalName: existing-aks-cluster
          forProvider:
            resourceGroupName: my-resource-group
```

## Migration Strategy

### Phase 1: Discovery

1. List existing resources
2. Document external names
3. Create import claim

```bash
# GCP example
gcloud container clusters list --format="table(name,location,status)"

# AWS example
aws eks list-clusters --query 'clusters'

# Azure example
az aks list --query "[].{name:name,resourceGroup:resourceGroup}"
```

### Phase 2: Observe

```yaml
# Start in observe mode
spec:
  parameters:
    import:
      enabled: true
      mode: observe
      resources:
        cluster:
          externalName: my-cluster
```

Verify:
```bash
# Apply the claim
kubectl apply -f import-claim.yaml

# Check resource status
kubectl get cluster.container.gcp.upbound.io -o yaml

# Verify observed state matches reality
kubectl describe cluster my-cluster
```

### Phase 3: Validate

Confirm Crossplane's observed state matches the actual cloud resource:

```bash
# Compare Crossplane status with cloud reality
crossplane beta trace cluster my-cluster

# Check for drift
kubectl get cluster my-cluster -o jsonpath='{.status.atProvider}'
```

### Phase 4: Transition to Manage

```yaml
# Switch to manage mode
spec:
  parameters:
    import:
      enabled: true
      mode: manage
      resources:
        cluster:
          externalName: my-cluster
```

Now Crossplane will:
- Apply changes from your spec
- Keep deletionPolicy: Orphan (safety net)
- Maintain the resource

### Phase 5: Normal Operation

Once stable, you can optionally remove the import configuration:

```yaml
# Remove import section - now a normal managed resource
spec:
  parameters:
    domain: my-cluster.example.com
  forProvider:
    location: us-central1
```

## Gotchas and Best Practices

### 1. External Names Must Match Exactly

```yaml
# Wrong - will create new resource
externalName: my-cluster  # Cloud has "my-cluster-abc"

# Correct
externalName: my-cluster-abc
```

### 2. ForProvider Must Be Compatible

```yaml
# Cloud resource has region: us-east-1
# Your spec says:
forProvider:
  region: us-west-2  # Will try to update region (might fail!)

# Better: Match the existing config
forProvider:
  region: us-east-1
```

### 3. Always Use Orphan DeletionPolicy

```yaml
# During import, always use Orphan
spec:
  deletionPolicy: Orphan  # Resource survives if Crossplane resource deleted
```

### 4. Validate Before Managing

```python
def _validate_import_config(c, resource_type, config):
    """Validate import configuration before proceeding."""
    external_name = config.get("externalName")
    if not external_name:
        response.fatal(c.rsp, f"{resource_type} import missing externalName")
        return False

    # Check resource exists in observed state
    observed = c.get_observed(f"import-check-{resource_type}")
    if not observed:
        c.log.warning(f"{resource_type} {external_name} not found in cloud")

    return True
```

### 5. Handle Partial Imports

Not all resources need to be imported. Mix imported and new:

```yaml
spec:
  parameters:
    import:
      enabled: true
      mode: manage
      resources:
        cluster:
          externalName: existing-cluster  # Import this
        # nodePools not specified - will create new ones
```

## Testing Import Workflows

```bash
# Test observe mode locally
crossplane beta render \
  examples/import/observe-claim.yaml \
  apis/cluster/composition.yaml \
  examples/functions.yaml \
  -e examples/envconfigs/ \
  -r

# Check managementPolicies are correct
crossplane beta render ... | grep -A5 "managementPolicies"

# Verify deletionPolicy
crossplane beta render ... | grep -A5 "deletionPolicy"
```

## Key Takeaways

- **Observe mode** reads state without modifications—safe for discovery
- **Manage mode** takes control while keeping orphan deletion policy
- **External names** must match exactly the cloud resource names
- **Always use deletionPolicy: Orphan** during import
- **Validate observed state** matches cloud reality before managing
- **Gradual migration** is safer than big-bang

## Next Up

In Part 10, we'll bring everything together in a production multi-cloud cluster platform—the capstone of this series.

---

*Written by [Marouan Chakran](https://marouan.net), Senior SRE and Platform Engineer, building multi-cloud platforms with Crossplane and Python.*

**Part 9 of 10** | Previous: [CI/CD Pipelines](part-08-cicd-pipelines.md) | Next: [Production Multi-Cloud Platform](part-10-production-multi-cloud-platform.md)

Companion repository: [github.com/Marouan-chak/crossplane-python-blog-series](https://github.com/Marouan-chak/crossplane-python-blog-series)

**Tags**: crossplane, platform-engineering, kubernetes, python, devops