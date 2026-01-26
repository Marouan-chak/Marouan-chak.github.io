---
title: "Templating Helm Releases with Jinja2"
description: "Your clusters need applications: cert-manager, ingress controllers, monitoring stacks. Crossplane's Helm provider deploys these, but Helm values often need..."
date: 2026-01-23
series: "crossplane-python-blog-posts"
series_title: "Crossplane Python Functions"
part: 7
cover_image: "/blog/crossplane-python-blog-posts/images/covers/part-07-cover.png"
tags:
  - blog
  - crossplane-python-blog-posts
permalink: /blog/crossplane-python-blog-posts/part-07/
layout: layouts/blog.njk
---

# Templating Helm Releases with Jinja2

**Crossplane Python Functions | Part 7**

*Building a production multi-cloud platform with Python*

---

Your clusters need applications: cert-manager, ingress controllers, monitoring stacks. Crossplane's Helm provider deploys these, but Helm values often need dynamic content—cluster names, endpoints, secrets from the composition context.

This post shows how to integrate Jinja2 templating into your Python functions for dynamic Helm value generation.

## The Problem: Static Helm Values

A naive approach uses static values:

```python
def add_ingress_nginx(c: Composition):
    myplatform.add_helm_release(
        composition=c,
        release=HelmRelease(
            name="ingress-nginx",
            repo="https://kubernetes.github.io/ingress-nginx",
            version="4.9.0",
            values={
                "controller": {
                    "replicaCount": 2,
                    "service": {
                        "annotations": {
                            "cloud.google.com/load-balancer-type": "Internal"
                        }
                    }
                }
            }
        ),
    )
```

Problems:

1. **Cloud-specific annotations hard-coded** - GCP vs AWS vs Azure annotations differ
2. **No access to composition data** - Can't reference cluster name, domain, etc.
3. **Environment configs unused** - Can't change replica count per environment
4. **Duplicate values across charts** - Common settings repeated everywhere

## Jinja2 for Dynamic Values

Jinja2 is Python's most popular templating engine. It lets you write templates that reference variables at render time.

![Diagram showing dynamic Helm values generation using Jinja2 templating inside a Crossplane Python function](/blog/crossplane-python-blog-posts/images/diagrams/part-07-jinja2-pipeline.png)

### Basic Jinja2 Example

```python
from jinja2 import Template

template = Template("""
controller:
  replicaCount: {{ replica_count }}
  service:
    annotations:
      {{ annotation_key }}: {{ annotation_value }}
""")

values_yaml = template.render(
    replica_count=3,
    annotation_key="cloud.google.com/load-balancer-type",
    annotation_value="Internal",
)

print(values_yaml)
# controller:
#   replicaCount: 3
#   service:
#     annotations:
#       cloud.google.com/load-balancer-type: Internal
```

## Integrating with Compositions

### The HelmRelease Dataclass

First, define a structured representation:

```python
from dataclasses import dataclass

@dataclass
class HelmRelease:
    """A Helm Release configuration."""

    name: str           # Release name
    repo: str           # Chart repository URL
    version: str        # Chart version
    chart: str = ""     # Chart name (defaults to release name)
    namespace: str = "" # Target namespace (defaults to release name)
    values: dict | str | None = None  # Values as dict or Jinja2 template

    def __post_init__(self):
        self.chart = self.chart or self.name
        self.namespace = self.namespace or self.name
```

### The MyPlatform Helper Class

To call myplatform functions from templates:

```python
import importlib

class MyPlatform:
    """Exposes myplatform functions to Jinja2 templates."""

    def __init__(self, composition):
        self.composition = composition
        self.module = importlib.import_module("myplatform")

    def __getattr__(self, name):
        """Return a lambda that injects the composition."""
        return lambda *args, **kwargs: getattr(self.module, name)(
            *args, **kwargs, composition=self.composition
        )
```

This lets templates call `myplatform.add_bucket(...)` directly.

### The add_helm_release Function

```python
import yaml
from jinja2 import Template, Undefined, make_logging_undefined

def add_helm_release(
    release: HelmRelease,
    providerconfig_resource: str,
    **r: Unpack[ResourceDict],
):
    """Add a Helm release with Jinja2 templated values."""
    if "external_name" not in r:
        r["external_name"] = release.name
    resource = Resource(**r)

    values = release.values
    if values:
        # Accept both dicts and strings
        if isinstance(values, dict):
            values = yaml.dump(values)

        # Create undefined handler that logs missing variables
        logging_undefined = make_logging_undefined(
            logger=resource.composition.log,
            base=Undefined,
        )

        # Render the template
        try:
            values = Template(
                values,
                undefined=logging_undefined,
                finalize=lambda x: "" if x is None else x,
            ).render(
                # Spread environment configs
                **resource.composition.env,
                # Add composition context
                composition=resource.composition,
                cloud=resource.cloud,
                logger=resource.composition.log,
                ns=release.namespace,
                # Add myplatform functions
                myplatform=MyPlatform(resource.composition),
            )
        except Exception as e:
            resource.composition.log.error(
                f"Failed to render template for {release.name}: {e}"
            )
            raise

        # Parse back to dict for Crossplane
        values = yaml.safe_load(values)

    # Build the Release resource
    definition = {
        "kind": "Release",
        "apiVersion": "helm.crossplane.io/v1beta1",
        "spec": {
            "forProvider": {
                "chart": {
                    "name": release.chart,
                    "repository": release.repo,
                    "version": release.version,
                },
                "values": values or {},
                "namespace": release.namespace,
            },
            "providerConfigRef": {
                "name": get_resource_name(
                    resource.composition.observed,
                    providerconfig_resource,
                ),
            },
        },
    }

    add_definition(definition, release.name, **r)
```

## Writing Templated Values

### Basic Variable Substitution

```python
def add_cert_manager(c: Composition):
    myplatform.add_helm_release(
        composition=c,
        release=HelmRelease(
            name="cert-manager",
            repo="https://charts.jetstack.io",
            version="v1.14.0",
            values="""
installCRDs: true
prometheus:
  enabled: {{ monitoring.enabled | default(true) }}
replicaCount: {{ cert_manager_replicas | default(1) }}
""",
        ),
        providerconfig_resource="helm_providerconfig",
        uses=["cluster", "k8s-provider"],
    )
```

### Cloud-Specific Configuration

```python
def add_ingress_nginx(c: Composition):
    myplatform.add_helm_release(
        composition=c,
        release=HelmRelease(
            name="ingress-nginx",
            repo="https://kubernetes.github.io/ingress-nginx",
            version="4.9.0",
            values="""
controller:
  replicaCount: {{ ingress_replicas | default(2) }}
  service:
    annotations:
{% if cloud == "gcp" %}
      cloud.google.com/load-balancer-type: "Internal"
      networking.gke.io/load-balancer-type: "Internal"
{% elif cloud == "aws" %}
      service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
      service.beta.kubernetes.io/aws-load-balancer-scheme: "internal"
{% elif cloud == "azure" %}
      service.beta.kubernetes.io/azure-load-balancer-internal: "true"
{% endif %}
""",
        ),
        providerconfig_resource="helm_providerconfig",
        uses=["cluster"],
    )
```

### Accessing Composition Context

```python
def add_external_dns(c: Composition):
    myplatform.add_helm_release(
        composition=c,
        release=HelmRelease(
            name="external-dns",
            repo="https://kubernetes-sigs.github.io/external-dns",
            version="1.14.0",
            values="""
provider: {{ cloud }}
domainFilters:
  - {{ composition.params.domain }}

{% if cloud == "gcp" %}
google:
  project: {{ composition.plane }}
  serviceAccountSecretRef:
    name: external-dns-gcp
    key: credentials.json
{% elif cloud == "aws" %}
aws:
  region: {{ composition.location }}
  zoneType: public
{% endif %}

txtOwnerId: {{ composition.metadata.name }}
""",
        ),
        providerconfig_resource="helm_providerconfig",
        uses=["cluster", "dns_zone"],
    )
```

### Using Environment Config Values

```python
def add_prometheus(c: Composition):
    myplatform.add_helm_release(
        composition=c,
        release=HelmRelease(
            name="kube-prometheus-stack",
            repo="https://prometheus-community.github.io/helm-charts",
            version="56.0.0",
            values="""
prometheus:
  prometheusSpec:
    retention: {{ monitoring.retention | default("30d") }}
    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: {{ storage_class | default("standard") }}
          resources:
            requests:
              storage: {{ monitoring.storage_size | default("50Gi") }}

grafana:
  enabled: {{ monitoring.grafana.enabled | default(true) }}
  adminPassword: {{ monitoring.grafana.admin_password | default("admin") }}

alertmanager:
  enabled: {{ monitoring.alertmanager.enabled | default(true) }}
  config:
    global:
      resolve_timeout: 5m
    receivers:
      - name: 'null'
{% if monitoring.slack.webhook %}
      - name: 'slack'
        slack_configs:
          - api_url: {{ monitoring.slack.webhook }}
            channel: {{ monitoring.slack.channel | default("#alerts") }}
{% endif %}
""",
        ),
        providerconfig_resource="helm_providerconfig",
        uses=["cluster"],
    )
```

## Advanced Templating Patterns

### Loops in Templates

```python
values = """
config:
  sources:
{% for source in data_sources %}
    - name: {{ source.name }}
      type: {{ source.type }}
      url: {{ source.url }}
{% endfor %}
"""
```

### Conditional Blocks

```python
values = """
{% if features.ha_mode %}
replicaCount: 3
affinity:
  podAntiAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchLabels:
            app.kubernetes.io/name: {{ release_name }}
        topologyKey: kubernetes.io/hostname
{% else %}
replicaCount: 1
{% endif %}
"""
```

### Default Values

```python
values = """
# Simple default
replicas: {{ replicas | default(1) }}

# Nested default
timeout: {{ config.timeout | default(30) }}

# Default to expression
name: {{ custom_name | default(composition.metadata.name) }}
"""
```

### Safe Access with Filters

```python
values = """
# Avoid errors if key doesn't exist
{% if monitoring is defined and monitoring.enabled %}
metrics:
  enabled: true
{% endif %}

# Or use default filter
metrics:
  enabled: {{ (monitoring.enabled if monitoring is defined else true) }}
"""
```

## Handling Undefined Variables

Jinja2's default behavior raises errors on undefined variables. Use `make_logging_undefined` to log instead:

```python
from jinja2 import make_logging_undefined, Undefined

logging_undefined = make_logging_undefined(
    logger=composition.log,
    base=Undefined,
)

template = Template(
    values_template,
    undefined=logging_undefined,
)
```

Now missing variables log warnings instead of crashing:

```
WARNING: Template variable 'monitoring.slack.webhook' is undefined
```

### Custom Undefined Handling

```python
from jinja2 import Undefined

class SilentUndefined(Undefined):
    """Undefined variables return empty string."""

    def _fail_with_undefined_error(self, *args, **kwargs):
        return ""

    def __str__(self):
        return ""

    def __iter__(self):
        return iter([])

template = Template(values, undefined=SilentUndefined)
```

## Calling MyPlatform from Templates

The `MyPlatform` helper lets templates create additional resources:

```python
values = """
# This calls myplatform.add_bucket() from within the template
{% set _ = myplatform.add_bucket(
    name="loki-chunks",
    external_name=composition.metadata.name + "-loki",
    template={"spec": {"forProvider": {"location": composition.location}}}
) %}

loki:
  storage:
    type: gcs
    bucketNames:
      chunks: {{ composition.metadata.name }}-loki
      ruler: {{ composition.metadata.name }}-loki
"""
```

This is powerful but use with caution—it can make templates harder to understand.

## Error Handling

### Validation Before Rendering

```python
def validate_values_template(template_str: str, available_vars: dict):
    """Check that all template variables are available."""
    from jinja2 import Environment, meta

    env = Environment()
    ast = env.parse(template_str)
    required_vars = meta.find_undeclared_variables(ast)

    missing = required_vars - set(available_vars.keys())
    if missing:
        raise ValueError(f"Template requires missing variables: {missing}")
```

### Catching Render Errors

```python
try:
    rendered = template.render(**context)
except Exception as e:
    composition.log.error(
        f"Template render failed for {release.name}",
        error=str(e),
        template=values_template[:200],  # First 200 chars for debugging
    )
    raise
```

### YAML Parse Validation

```python
try:
    values = yaml.safe_load(rendered_template)
except yaml.YAMLError as e:
    composition.log.error(
        f"Invalid YAML after template render for {release.name}",
        error=str(e),
    )
    raise
```

## Testing Templates

### Unit Testing

```python
import pytest
from jinja2 import Template

def test_ingress_nginx_gcp_values():
    template = Template("""
controller:
  service:
    annotations:
{% if cloud == "gcp" %}
      cloud.google.com/load-balancer-type: "Internal"
{% endif %}
""")

    result = template.render(cloud="gcp")
    assert "cloud.google.com/load-balancer-type" in result
    assert "Internal" in result

def test_ingress_nginx_aws_values():
    template = Template("""
controller:
  service:
    annotations:
{% if cloud == "aws" %}
      service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
{% endif %}
""")

    result = template.render(cloud="aws")
    assert "aws-load-balancer-type" in result
```

### Integration Testing with Render

```bash
# Test full render with templates
crossplane beta render \
  examples/claim.yaml \
  apis/cluster/composition.yaml \
  examples/functions.yaml \
  -e examples/envconfigs/ \
  -r | grep -A50 "kind: Release"
```

## Best Practices

### 1. Keep Templates Readable

```yaml
# Good: Clear structure
controller:
  replicaCount: {{ replicas | default(2) }}
  resources:
    requests:
      cpu: {{ cpu_request | default("100m") }}
      memory: {{ memory_request | default("128Mi") }}

# Avoid: Complex inline expressions
controller:
  replicaCount: {{ ((env.production and 5) or (env.staging and 3) or 2) }}
```

### 2. Use Environment Configs for Defaults

```yaml
# In EnvironmentConfig (not in template)
monitoring:
  prometheus:
    retention: 30d
    storage: 50Gi

# Template just references
retention: {{ monitoring.prometheus.retention }}
storage: {{ monitoring.prometheus.storage }}
```

### 3. Document Template Variables

```python
def add_custom_app(c: Composition):
    """Add custom application Helm release.

    Template variables from environment config:
    - custom_app.replicas: Number of replicas (default: 1)
    - custom_app.image_tag: Docker image tag (required)
    - custom_app.resources.cpu: CPU request (default: 100m)
    """
    myplatform.add_helm_release(...)
```

### 4. Validate Required Variables

```python
def add_app(c: Composition):
    # Check required config exists
    if not get(c.env, "custom_app.image_tag"):
        c.log.error("Missing required config: custom_app.image_tag")
        response.fatal(c.rsp, "custom_app.image_tag is required")
        return

    myplatform.add_helm_release(...)
```

## Complete Example

### EnvironmentConfig

```yaml
apiVersion: apiextensions.crossplane.io/v1alpha1
kind: EnvironmentConfig
metadata:
  name: defaults.charts.ingress-nginx
  labels:
    baseline: default
data:
  charts:
    ingress-nginx:
      enabled: true
      version: "4.9.0"
      replicas: 2
      internal: true
```

### Helm Release Function

```python
def add_ingress_nginx(c: Composition):
    config = get(c.env, "charts.ingress-nginx", {})

    if config.get("disabled", False):
        c.log.info("ingress-nginx disabled by config")
        return

    myplatform.add_helm_release(
        composition=c,
        release=HelmRelease(
            name="ingress-nginx",
            repo="https://kubernetes.github.io/ingress-nginx",
            version=config.get("version", "4.9.0"),
            values="""
controller:
  replicaCount: {{ charts['ingress-nginx'].replicas | default(2) }}
  service:
{% if charts['ingress-nginx'].internal | default(true) %}
    annotations:
{% if cloud == "gcp" %}
      cloud.google.com/load-balancer-type: "Internal"
{% elif cloud == "aws" %}
      service.beta.kubernetes.io/aws-load-balancer-scheme: "internal"
{% elif cloud == "azure" %}
      service.beta.kubernetes.io/azure-load-balancer-internal: "true"
{% endif %}
{% endif %}
  metrics:
    enabled: {{ monitoring.enabled | default(true) }}
""",
        ),
        providerconfig_resource="helm_providerconfig",
        uses=["cluster"],
    )
```

## Key Takeaways

- **Jinja2 templates** enable dynamic Helm values based on composition context
- **Pass environment config** as template variables with `**composition.env`
- **Cloud conditionals** handle provider-specific annotations and settings
- **Use `make_logging_undefined`** to log missing variables instead of crashing
- **The `MyPlatform` helper** exposes functions to templates (use sparingly)
- **Validate templates** before rendering to catch missing variables early

## Next Up

In Part 8, we'll build CI/CD pipelines for your composition functions—GitHub Actions workflows that test, build, and deploy your functions automatically.

---

*Written by [Marouan Chakran](https://marouan.net), Senior SRE and Platform Engineer, building multi-cloud platforms with Crossplane and Python.*

**Part 7 of 10** | Previous: [Configuration with EnvironmentConfigs](part-06-environment-configs.md) | Next: [CI/CD Pipelines](part-08-cicd-pipelines.md)

Companion repository: [github.com/Marouan-chak/crossplane-python-blog-series](https://github.com/Marouan-chak/crossplane-python-blog-series)

**Tags**: crossplane, platform-engineering, kubernetes, python, devops