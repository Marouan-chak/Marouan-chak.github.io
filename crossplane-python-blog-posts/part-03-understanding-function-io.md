---
title: "Understanding Composition Function I/O"
description: "In Part 2, we built a working function but treated the request and response as black boxes. To build sophisticated compositions, you need to understand..."
date: 2026-01-19
series: "crossplane-python-blog-posts"
series_title: "Crossplane Python Functions"
part: 3
cover_image: "/blog/crossplane-python-blog-posts/images/covers/part-03-cover.webp"
tags:
  - blog
  - crossplane-python-blog-posts
permalink: /blog/crossplane-python-blog-posts/part-03/
layout: layouts/blog.njk
---

# Understanding Composition Function I/O

**Crossplane Python Functions | Part 3**

*Building a production multi-cloud platform with Python*

---

In Part 2, we built a working function but treated the request and response as black boxes. To build sophisticated compositions, you need to understand exactly what data flows through your function.

This post dissects `RunFunctionRequest` and `RunFunctionResponse`, shows how to convert protobuf structures to Python dicts, and introduces a type-safe `Composition` class that simplifies working with these structures.

## The RunFunctionRequest

Every function invocation receives a `RunFunctionRequest`. This protobuf message contains everything your function needs to make decisions.

### Request Structure

```protobuf
message RunFunctionRequest {
  RequestMeta meta = 1;
  State observed = 2;
  State desired = 3;
  google.protobuf.Struct input = 4;
  google.protobuf.Struct context = 5;
  repeated Credentials credentials = 6;
}
```

Let's examine each field:

![Diagram of Crossplane composition function input and output structures including observed and desired resource state](/blog/crossplane-python-blog-posts/images/diagrams/part-03-io-structure.webp)

### 1. meta: Request Metadata

```python
req.meta.tag  # Unique identifier for this request
```

The `tag` is useful for logging and debugging—it identifies the specific reconciliation.

### 2. observed: Current Cluster State

This is what actually exists:

```python
# The composite resource (XR) as it exists in the cluster
req.observed.composite.resource

# Managed resources created by previous reconciliations
req.observed.resources  # Dict[str, ObservedResource]
```

The observed state includes:

- **composite**: The XR with its current spec and status
- **resources**: Managed resources keyed by their composition resource name

Each observed resource contains:

```python
observed_bucket = req.observed.resources["bucket"]
observed_bucket.resource       # The full resource as a Struct
observed_bucket.connection_details  # Connection secrets
```

### 3. desired: What Previous Functions Requested

In a pipeline with multiple functions, each function receives what previous functions requested:

```python
# Resources from earlier pipeline steps
req.desired.composite.resource
req.desired.resources  # Dict[str, DesiredResource]
```

Your function should preserve or modify this state, not replace it entirely.

### 4. input: Function Configuration

Configuration passed to your function in the composition:

```yaml
pipeline:
  - step: my-function
    functionRef:
      name: function-myplatform
    input:
      apiVersion: myplatform.io/v1alpha1
      kind: Input
      module: cluster
      debug: true
```

Access in Python:

```python
input_dict = MessageToDict(req.input)
module = input_dict.get("module", "default")
debug = input_dict.get("debug", False)
```

### 5. context: Environment and Extra Data

Environment configs and data from previous functions:

```python
# Environment configs merged by label selectors
env = req.context["apiextensions.crossplane.io/environment"]

# Custom context from previous functions
custom_data = req.context.get("my-custom-key", {})
```

Environment configs are powerful—we'll cover them in Part 6.

## The RunFunctionResponse

Your function returns a `RunFunctionResponse` describing what should exist.

### Response Structure

```protobuf
message RunFunctionResponse {
  ResponseMeta meta = 1;
  State desired = 2;
  repeated Result results = 3;
  google.protobuf.Struct context = 4;
  repeated Requirement requirements = 5;
  repeated Condition conditions = 6;
}
```

### 1. desired: Resources You Want

The most important field—what resources should exist:

```python
# Set desired composite resource
rsp.desired.composite.resource.CopyFrom(xr_struct)

# Add a managed resource
rsp.desired.resources["bucket"].resource.CopyFrom(bucket_struct)

# Mark a resource as ready
rsp.desired.resources["bucket"].ready = (
    fnv1.Ready.READY_TRUE
)
```

### 2. results: Feedback Messages

Report status, warnings, or errors:

```python
from crossplane.function import response

# Info message
response.normal(rsp, "Created 3 buckets")

# Warning
response.warning(rsp, "Deprecated parameter 'oldName' used")

# Fatal error (stops reconciliation)
response.fatal(rsp, "Missing required label 'cloud'")
```

### 3. context: Pass Data Forward

Share data with subsequent functions:

```python
context_struct = struct_pb2.Struct()
context_struct.fields["cluster_endpoint"].string_value = endpoint
rsp.context.CopyFrom(context_struct)
```

### 4. conditions: XR Status Conditions

Set conditions on the composite resource:

```python
rsp.conditions.append(fnv1.Condition(
    type="DatabaseReady",
    status=fnv1.Status.STATUS_CONDITION_TRUE,
    reason="Available",
    message="Database is accepting connections",
))
```

## Protobuf to Python Dict Conversion

Working with raw protobuf is tedious. Convert to Python dicts for easier manipulation.

### Using MessageToDict

```python
from google.protobuf.json_format import MessageToDict

# Convert the XR to a dict
xr = req.observed.composite.resource
xr_dict = MessageToDict(xr)

# Now you can use normal Python operations
bucket_name = xr_dict["spec"]["parameters"]["bucketName"]
labels = xr_dict["metadata"]["labels"]
```

### Converting Back to Protobuf

Use `google.protobuf.struct_pb2.Struct`:

```python
from google.protobuf import struct_pb2
from google.protobuf.json_format import ParseDict

# Method 1: ParseDict
bucket_dict = {"apiVersion": "s3.aws...", "kind": "Bucket", ...}
bucket_struct = struct_pb2.Struct()
ParseDict(bucket_dict, bucket_struct)

# Method 2: Manual conversion (more control)
def dict_to_struct(d: dict, struct: struct_pb2.Struct) -> None:
    """Recursively convert a dict to a protobuf Struct."""
    for key, value in d.items():
        if isinstance(value, dict):
            dict_to_struct(value, struct.fields[key].struct_value)
        elif isinstance(value, list):
            list_value = struct.fields[key].list_value
            for item in value:
                if isinstance(item, dict):
                    dict_to_struct(item, list_value.values.add().struct_value)
                elif isinstance(item, bool):
                    list_value.values.add().bool_value = item
                elif isinstance(item, (int, float)):
                    list_value.values.add().number_value = item
                else:
                    list_value.values.add().string_value = str(item)
        elif isinstance(value, bool):
            struct.fields[key].bool_value = value
        elif isinstance(value, (int, float)):
            struct.fields[key].number_value = value
        elif value is None:
            struct.fields[key].null_value = 0
        else:
            struct.fields[key].string_value = str(value)
```

### Common Gotchas

**Booleans before numbers**: Python's `isinstance(True, int)` returns `True`, so check for `bool` before `int/float`.

**Empty dicts**: An empty dict `{}` needs explicit handling—don't skip it.

**None values**: Protobuf has `NullValue`, not Python's `None`.

## Building a Type-Safe Composition Class

Managing raw requests and responses is error-prone. Wrap them in a class.

### The Composition Dataclass

```python
from dataclasses import dataclass
from crossplane.function.proto.v1 import run_function_pb2 as fnv1
from google.protobuf.json_format import MessageToDict
from pydash import get, merge
from structlog.stdlib import BoundLogger

@dataclass
class Composition:
    """Wraps function request/response with convenient accessors."""

    req: fnv1.RunFunctionRequest
    rsp: fnv1.RunFunctionResponse
    log: BoundLogger

    def __post_init__(self):
        """Initialize computed properties."""
        self.observed = self.req.observed
        self.desired = self.rsp.desired

        # The composite resource
        self.xr = self.observed.composite.resource

        # Common metadata fields
        self.metadata = dict(self.xr.get("metadata", {}))
        self.labels = self.metadata.get("labels", {})
        self.annotations = self.metadata.get("annotations", {})
        self.name = self.metadata.get("name", "")

        # Cloud provider from label
        self.cloud = self.labels.get("cloud", "gcp")

        # Spec fields
        self.spec = dict(self.xr.get("spec", {}))
        self.params = MessageToDict(self.spec.get("parameters", {}))
        self.for_provider = MessageToDict(self.spec.get("forProvider", {}))

        # Environment configs
        env_key = "apiextensions.crossplane.io/environment"
        self.env = MessageToDict(self.req.context.get(env_key, {}))

        # Merge environment with XR labels and params for templates
        self.env = merge(
            self.env,
            self.labels,
            self.params,
        )

        # Location/region (varies by cloud)
        self.location = (
            get(self.for_provider, "location")
            or get(self.for_provider, "region")
            or get(self.env, "location")
            or get(self.env, "region")
        )

    def get_observed(self, name: str) -> dict | None:
        """Get an observed resource by name."""
        if name not in self.observed.resources:
            return None
        return MessageToDict(self.observed.resources[name].resource)

    def get_observed_status(self, name: str, field: str) -> any:
        """Get a field from an observed resource's status."""
        resource = self.get_observed(name)
        if not resource:
            return None
        return get(resource, f"status.atProvider.{field}")

    def is_ready(self, name: str) -> bool:
        """Check if an observed resource is ready."""
        if name not in self.observed.resources:
            return False
        conditions = self.get_observed(name).get("status", {}).get("conditions", [])
        for condition in conditions:
            if condition.get("type") == "Ready":
                return condition.get("status") == "True"
        return False
```

### Using the Composition Class

Now your function logic becomes clean:

```python
def RunFunction(self, req, context):
    rsp = response.to(req)
    c = Composition(req=req, rsp=rsp, log=self.log)

    # Clean access to common fields
    c.log.info("Processing", cloud=c.cloud, name=c.name)

    # Access parameters naturally
    bucket_name = c.params.get("bucketName", f"{c.name}-bucket")
    region = c.location

    # Check if a resource exists
    existing = c.get_observed("bucket")
    if existing:
        endpoint = c.get_observed_status("bucket", "endpoint")

    # Cloud-specific logic
    if c.cloud == "gcp":
        add_gcs_bucket(c, bucket_name, region)
    elif c.cloud == "aws":
        add_s3_bucket(c, bucket_name, region)

    return rsp
```

### Extending for Your Use Case

Add properties for your domain:

```python
@dataclass
class ClusterComposition(Composition):
    """Composition for Kubernetes clusters."""

    def __post_init__(self):
        super().__post_init__()

        # Cluster-specific fields
        self.cluster_name = self.labels.get("clusterName", self.name)
        self.pools = self.params.get("pools", {})
        self.domain = self.params.get("domain", "")

        # Networking
        self.network = self.env.get("network", {})
        self.subnet_cidr = self.network.get("subnetCidr", "10.0.0.0/24")

    @property
    def is_private(self) -> bool:
        """Whether this is a private cluster."""
        return self.params.get("privateCluster", True)

    @property
    def enable_dns(self) -> bool:
        """Whether to create DNS zones."""
        return bool(self.domain) and self.params.get("createDnsZones", True)
```

## Accessing Observed State

Observed state is crucial for:

- **Conditional logic**: Create resource B only after A is ready
- **Referencing outputs**: Use cluster endpoint in Helm values
- **Import workflows**: Check if resources exist before managing

### Checking Resource Existence

```python
def cluster_exists(c: Composition) -> bool:
    """Check if cluster is created and ready."""
    cluster = c.get_observed("cluster")
    if not cluster:
        return False
    return c.is_ready("cluster")
```

### Getting Resource Outputs

```python
def get_cluster_endpoint(c: Composition) -> str | None:
    """Get the cluster's API endpoint from observed state."""
    return c.get_observed_status("cluster", "endpoint")
```

### Conditional Resource Creation

```python
def add_helm_releases(c: Composition):
    """Add Helm releases only after cluster is ready."""
    if not cluster_exists(c):
        c.log.info("Waiting for cluster before adding Helm releases")
        return

    endpoint = get_cluster_endpoint(c)
    if not endpoint:
        c.log.warning("Cluster ready but no endpoint found")
        return

    add_cert_manager(c)
    add_ingress_nginx(c)
```

## Navigating Environment Configs

Environment configs provide defaults and overrides:

```python
# Get with fallback
machine_type = c.env.get("defaultMachineType", "e2-medium")

# Nested access with pydash
from pydash import get

monitoring_enabled = get(c.env, "monitoring.enabled", True)
prometheus_retention = get(c.env, "monitoring.prometheus.retention", "30d")
```

We'll cover environment configs in depth in Part 6.

## Complete Example

Here's a function using the Composition class:

```python
from dataclasses import dataclass
from crossplane.function import logging, response
from crossplane.function.proto.v1 import run_function_pb2 as fnv1
from crossplane.function.proto.v1.run_function_pb2_grpc import FunctionRunnerServiceServicer

class FunctionRunner(FunctionRunnerServiceServicer):
    def __init__(self):
        self.log = logging.get_logger()

    def RunFunction(self, req, context):
        rsp = response.to(req)
        c = Composition(req=req, rsp=rsp, log=self.log.bind(tag=req.meta.tag))

        try:
            self.create_resources(c)
        except Exception as e:
            c.log.error("Function failed", error=str(e))
            response.fatal(rsp, f"Function error: {e}")

        return rsp

    def create_resources(self, c: Composition):
        c.log.info("Creating resources", cloud=c.cloud, name=c.name)

        # Validate required fields
        if not c.cloud:
            response.fatal(c.rsp, "Missing required label: cloud")
            return

        # Create cloud-specific resources
        if c.cloud == "gcp":
            self.create_gcp_resources(c)
        elif c.cloud == "aws":
            self.create_aws_resources(c)
        elif c.cloud == "azure":
            self.create_azure_resources(c)
        else:
            response.fatal(c.rsp, f"Unsupported cloud: {c.cloud}")

    def create_gcp_resources(self, c: Composition):
        # GCP-specific implementation
        pass

    def create_aws_resources(self, c: Composition):
        # AWS-specific implementation
        pass

    def create_azure_resources(self, c: Composition):
        # Azure-specific implementation
        pass
```

## Key Takeaways

- **`RunFunctionRequest`** contains observed state, desired state from previous functions, input config, and environment context
- **`RunFunctionResponse`** specifies what resources should exist and reports results
- **Use `MessageToDict`** to convert protobuf to Python dicts for easier manipulation
- **Wrap in a Composition class** for type safety and clean access to common fields
- **Observed state** lets you create resources conditionally based on what exists

## Next Up

In Part 4, we introduce the 3-layer resource pattern—the architecture that makes multi-cloud compositions maintainable. You'll learn how to write one function call that produces the correct resources for GCP, AWS, or Azure.

---

*Written by [Marouan Chakran](https://marouan.net), Senior SRE and Platform Engineer, building multi-cloud platforms with Crossplane and Python.*

**Part 3 of 10** | Previous: [Your First Python Function](part-02-your-first-python-function.md) | Next: [The 3-Layer Resource Pattern](part-04-three-layer-resource-pattern.md)

Companion repository: [github.com/Marouan-chak/crossplane-python-blog-series](https://github.com/Marouan-chak/crossplane-python-blog-series)

**Tags**: crossplane, platform-engineering, kubernetes, python, devops