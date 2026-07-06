---
permalink: false
eleventyExcludeFromCollections: true
---

Here is a concrete, production ready cover and visuals plan for your full series, optimized for platform engineers, discoverability, and consistent brand identity.

This is meant to be practical. You can hand this to a designer, or generate it yourself in Figma, Canva, or Excalidraw.

---

# Global Cover Template

Use **one consistent visual identity** across all parts so readers instantly recognize your series in feeds.

## Layout

**Top small header**
Crossplane Python Functions

**Main title**
Part X, <Topic>

**Subtitle, optional, smaller**
Building a production multi cloud platform with Python

**Visual motif**
One claim object in the center flowing into:

* GCP icon
* AWS icon
* Azure icon
  Connected by arrows, with a small Python logo in the processing layer

**Footer**
By Marouan Chakran
github.com/Marouan-chak/crossplane-python-blog-posts

## Style

* Background color changes per part
* Flat vector style
* Minimal text
* High contrast
* No stock photography

## Recommended Size

1600 × 900 pixels
This works well for Medium cover crop and social previews.

---

# Cover Text For Each Part

## Part 1

**Main title:**
Part 1, Why Python for Crossplane

**Subtitle:**
Replacing YAML patches with real programming logic

---

## Part 2

**Main title:**
Part 2, Building Your First Function

**Subtitle:**
From scaffold to running code

---

## Part 3

**Main title:**
Part 3, Mastering Function I O

**Subtitle:**
Understanding requests, responses, and reconciliation flow

---

## Part 4

**Main title:**
Part 4, The Three Layer Pattern

**Subtitle:**
A scalable multi cloud architecture

---

## Part 5

**Main title:**
Part 5, Dynamic Resource Discovery

**Subtitle:**
Generating infrastructure programmatically

---

## Part 6

**Main title:**
Part 6, Managing Environment Configs

**Subtitle:**
Multi environment configuration without chaos

---

## Part 7

**Main title:**
Part 7, Helm Templating with Jinja2

**Subtitle:**
Dynamic Helm values for real platforms

---

## Part 8

**Main title:**
Part 8, CI and CD Pipelines

**Subtitle:**
Testing and shipping composition functions safely

---

## Part 9

**Main title:**
Part 9, Importing Existing Infrastructure

**Subtitle:**
Adopting live resources without downtime

---

## Part 10

**Main title:**
Part 10, From Development to Production

**Subtitle:**
A full multi cloud platform in action

---

# Diagram Plan and Alt Text For Each Post

Each post gets **one meaningful diagram**. This is enough to boost clarity and retention.

---

## Part 1 Diagram

**Diagram idea**
YAML patches flow versus Python function flow.

Left side: claim → patch blocks → messy resource graph
Right side: claim → Python function → clean resource graph

**Alt text**
Diagram comparing YAML patch based Crossplane compositions with Python composition functions generating managed resources.

---

## Part 2 Diagram

**Diagram idea**
Function lifecycle:
claim → function input → Python logic → response → managed resources → reconcile loop

**Alt text**
Flow diagram showing how a Crossplane Python function receives a claim and produces managed resources during reconciliation.

---

## Part 3 Diagram

**Diagram idea**
Function request and response objects structure.

Boxes:
Observed state
Desired state
Resources list

**Alt text**
Diagram of Crossplane composition function input and output structures including observed and desired resource state.

---

## Part 4 Diagram

**Diagram idea**
Three layer architecture:

* Interface layer: claim
* Logic layer: Python function
* Implementation layer: cloud specific resources

**Alt text**
Architecture diagram of the three layer Crossplane platform pattern separating interface, logic, and cloud implementation.

---

## Part 5 Diagram

**Diagram idea**
Dynamic resource generation loop.

Claim pools map → loop → N generated node pools

**Alt text**
Diagram showing dynamic generation of multiple managed resources from user input using Python logic.

---

## Part 6 Diagram

**Diagram idea**
Environment config resolution flow.

Environment → EnvironmentConfig → composition → function → resources

**Alt text**
Flow diagram of environment configuration resolution in Crossplane using EnvironmentConfigs and composition functions.

---

## Part 7 Diagram

**Diagram idea**
Helm templating pipeline.

Claim values → Jinja2 → Helm values → Helm release

**Alt text**
Diagram showing dynamic Helm values generation using Jinja2 templating inside a Crossplane Python function.

---

## Part 8 Diagram

**Diagram idea**
CI pipeline flow.

Commit → tests → render → image build → deploy → Crossplane function

**Alt text**
CI and CD pipeline diagram for testing and deploying Crossplane Python composition functions.

---

## Part 9 Diagram

**Diagram idea**
Import workflow.

Existing cloud resources → Observe mode → LateInitialize → Full management

**Alt text**
Sequence diagram showing safe adoption of existing cloud resources using Crossplane import and observe workflows.

---

## Part 10 Diagram

**Diagram idea**
Full platform overview.

Single claim → Python function → GCP, AWS, Azure stacks

**Alt text**
High level architecture of a production multi cloud Kubernetes platform built using Crossplane Python composition functions.

---

# Posting Strategy For Maximum Reach

For each post:

1. Consistent cover template
2. One architecture diagram
3. One small real screenshot or render output
4. Strong opening paragraph
5. Clear section headings
6. Five targeted tags

Suggested tags for this series:

* crossplane
* platform engineering
* kubernetes
* python
* devops

---

# Optional Branding Upgrade

If you want to seriously build personal brand authority:

Add a **small signature footer** under every post:

“Written by Marouan Chakran, Senior SRE and Platform Engineer, building multi cloud platforms with Crossplane and Python.”

This increases recognition and follow rate.

---

---

# Image Placement Guide For Each Post

Recommended locations within each blog post for cover image, main diagram, and optional screenshot/render output.

---

## Part 1: Why Python for Crossplane

**Cover image**: After the title and series tag, before the opening paragraph.

```markdown
# Why Python for Crossplane Compositions?

*Part 1 of a 10-part series...*

![Cover: Part 1 - Why Python for Crossplane](images/covers/part-01-cover.png)

---

If you've worked with Crossplane...
```

**Main diagram (YAML vs Python flow)**: After "The patch-and-transform model forces you to encode programming logic in YAML" paragraph (around line 44), before Phase 2.

```markdown
The patch-and-transform model forces you to encode programming logic in YAML. The result is compositions that are hard to read, harder to test, and nearly impossible to debug.

![Diagram comparing YAML patch-based Crossplane compositions with Python composition functions](images/diagrams/part-01-yaml-vs-python.png)

### Phase 2: Composition Functions (The Polyglot Era)
```

**Optional screenshot**: After "The same composition function interprets this claim and produces:" section (around line 172), showing the multi-cloud output concept.

---

## Part 2: Your First Python Function

**Cover image**: After title and series tag.

**Main diagram (Function lifecycle)**: After "### Key Components" section (around line 133), before "## Writing Your First Function".

```markdown
**4. `response.to(req)`**: A helper that initializes a response from a request, copying over the existing desired state.

![Flow diagram showing Crossplane Python function lifecycle](images/diagrams/part-02-function-lifecycle.png)

## Writing Your First Function
```

**Screenshot of render output**: After the `crossplane beta render` output block (around line 338), showing the actual terminal output.

```markdown
Your function created a Bucket resource from the composite resource spec.

![Screenshot of crossplane beta render terminal output](images/screenshots/part-02-render-output.png)

### View Function Logs
```

---

## Part 3: Understanding Function I/O

**Cover image**: After title and series tag.

**Main diagram (Request/Response structure)**: After "Let's examine each field:" (around line 29), before "### 1. meta: Request Metadata".

```markdown
Let's examine each field:

![Diagram of Crossplane composition function input and output structures](images/diagrams/part-03-io-structure.png)

### 1. meta: Request Metadata
```

**Optional diagram**: After "## The RunFunctionResponse" section intro (around line 115), showing the response structure visually.

---

## Part 4: The 3-Layer Resource Pattern

**Cover image**: After title and series tag.

**Main diagram (3-layer architecture)**: After "## The Solution: Separate Concerns into Layers" (around line 61), before "### Layer 1".

```markdown
## The Solution: Separate Concerns into Layers

The 3-layer pattern separates **what** you want from **how** each cloud implements it.

![Architecture diagram of the 3-layer Crossplane platform pattern](images/diagrams/part-04-three-layer.png)

### Layer 1: Function Call (Composition Entrypoint)
```

**File structure diagram**: After "## File Organization" (around line 337), showing the directory tree visually.

---

## Part 5: Dynamic Provider Discovery

**Cover image**: After title and series tag.

**Main diagram (Dynamic generation loop)**: After "## Understanding the Call Flow" (around line 245), before "### 1. User Calls add_bucket".

```markdown
## Understanding the Call Flow

Let's trace a complete call:

![Diagram showing dynamic resource generation using Python introspection](images/diagrams/part-05-introspection-flow.png)

### 1. User Calls add_bucket
```

**Optional code flow diagram**: After the complete call flow section (around line 310), showing the inspect/importlib magic visually.

---

## Part 6: Configuration Management with EnvironmentConfigs

**Cover image**: After title and series tag.

**Main diagram (Environment config resolution)**: After "## Label-Based Selection" intro (around line 88), before "### Composition Environment Selector".

```markdown
## Label-Based Selection

EnvironmentConfigs are selected based on label matching in your composition definition.

![Flow diagram of environment configuration resolution in Crossplane](images/diagrams/part-06-envconfig-flow.png)

### Composition Environment Selector
```

**Hierarchy diagram**: After "### Layer Order" list (around line 189), showing the visual cascade from baseline to plane-specific.

---

## Part 7: Templating Helm Releases with Jinja2

**Cover image**: After title and series tag.

**Main diagram (Helm templating pipeline)**: After "## Jinja2 for Dynamic Values" intro (around line 46), before "### Basic Jinja2 Example".

```markdown
## Jinja2 for Dynamic Values

Jinja2 is Python's most popular templating engine. It lets you write templates that reference variables at render time.

![Diagram showing Jinja2 templating pipeline for Helm values](images/diagrams/part-07-jinja2-pipeline.png)

### Basic Jinja2 Example
```

**Optional screenshot**: After one of the cloud-specific configuration examples (around line 256), showing rendered output differences.

---

## Part 8: CI/CD Pipelines for Crossplane Functions

**Cover image**: After title and series tag.

**Main diagram (CI pipeline flow)**: After "## What We're Building" list (around line 21), before "## Repository Structure".

```markdown
6. **Supports semantic versioning** with Git tags

![CI/CD pipeline diagram for Crossplane Python composition functions](images/diagrams/part-08-cicd-pipeline.png)

## Repository Structure
```

**Screenshot of GitHub Actions**: After "### Build Status Badge" section (around line 619), showing an actual workflow run.

---

## Part 9: Importing Existing Infrastructure

**Cover image**: After title and series tag.

**Main diagram (Import workflow states)**: After the ASCII diagram (around line 65), replace or enhance with proper visual.

```markdown
## Import Workflow Overview

![Sequence diagram showing Crossplane import workflow: observe, manage, normal](images/diagrams/part-09-import-workflow.png)

1. **Observe mode** - Crossplane reads state, makes no changes
```

**Optional screenshot**: After "### Phase 3: Validate" section (around line 520), showing the `crossplane beta trace` output.

---

## Part 10: Building a Production Multi-Cloud Platform

**Cover image**: After title and series tag.

**Main diagram (Full platform architecture)**: After "And produces:" list (around line 47), before "## Project Structure".

```markdown
- **Workload Identity** bindings

![High-level architecture of production multi-cloud Kubernetes platform](images/diagrams/part-10-platform-architecture.png)

## Project Structure
```

**Secondary diagram**: After "## Cloud-Specific Implementations" section intro (around line 559), showing how one claim produces different cloud resources.

**Screenshot of cluster creation**: After "### Create a Cluster" (around line 820), showing terminal output of the claim being applied and watched.

---

# Image Folder Structure

Recommended folder organization for images:

```
images/
├── covers/
│   ├── part-01-cover.png
│   ├── part-02-cover.png
│   └── ... (all 10 covers)
├── diagrams/
│   ├── part-01-yaml-vs-python.png
│   ├── part-02-function-lifecycle.png
│   ├── part-03-io-structure.png
│   ├── part-04-three-layer.png
│   ├── part-05-introspection-flow.png
│   ├── part-06-envconfig-flow.png
│   ├── part-07-jinja2-pipeline.png
│   ├── part-08-cicd-pipeline.png
│   ├── part-09-import-workflow.png
│   └── part-10-platform-architecture.png
└── screenshots/
    ├── part-02-render-output.png
    ├── part-08-github-actions.png
    ├── part-09-trace-output.png
    └── part-10-cluster-creation.png
```

---

If you want, I can generate:

* A Figma layout spec
* A Canva template
* A prompt pack to auto generate all 10 covers with AI
* Excalidraw diagram templates for each post

Just tell me which direction you want.
