# Crossplane Python Composition Functions - Blog Series

A 10-part blog series on building multi-cloud platforms with Crossplane Python composition functions.

## Series Overview

| Part | Title | Read Time |
|------|-------|-----------|
| 1 | [Why Python for Crossplane Compositions?](part-01-why-python-for-crossplane.md) | 6 min |
| 2 | [Your First Python Composition Function](part-02-your-first-python-function.md) | 8 min |
| 3 | [Understanding Composition Function I/O](part-03-understanding-function-io.md) | 8 min |
| 4 | [The 3-Layer Resource Pattern](part-04-three-layer-resource-pattern.md) | 10 min |
| 5 | [Dynamic Provider Discovery](part-05-dynamic-provider-discovery.md) | 8 min |
| 6 | [Configuration Management with EnvironmentConfigs](part-06-environment-configs.md) | 10 min |
| 7 | [Templating Helm Releases with Jinja2](part-07-helm-templating-jinja2.md) | 10 min |
| 8 | [CI/CD Pipelines for Crossplane Functions](part-08-cicd-pipelines.md) | 10 min |
| 9 | [Importing Existing Infrastructure](part-09-importing-existing-infrastructure.md) | 10 min |
| 10 | [Building a Production Multi-Cloud Platform](part-10-production-multi-cloud-platform.md) | 12 min |

## Target Audience

- **Primary**: Platform engineers building internal developer platforms
- **Secondary**: SREs managing multi-cloud infrastructure
- **Prerequisites**: Basic Kubernetes, Python fundamentals, YAML

## Learning Path

```
Parts 1-3:  Foundation     → Concepts + first function
Parts 4-6:  Intermediate   → Multi-cloud patterns + configuration
Parts 7-9:  Advanced       → Production features + CI/CD
Part 10:    Capstone       → Full multi-cloud implementation
```

## Companion Code Repository

All code examples are available in the companion repository:

**[crossplane-python-blog-series](https://github.com/Marouan-chak/crossplane-python-blog-series)**

The code repo contains:
- Working examples for each part
- Multi-cloud implementations (GCP, AWS, Azure)
- CI/CD pipelines
- Helper scripts for local development

## Key Topics Covered

- **3-Layer Resource Pattern**: Separation of concerns for multi-cloud
- **Dynamic Provider Discovery**: Python introspection for automatic routing
- **EnvironmentConfigs**: Flexible configuration management
- **Jinja2 Templating**: Dynamic Helm value generation
- **Import Workflows**: Adopting existing infrastructure
- **CI/CD**: GitHub Actions for testing and deployment

## Publishing

These posts are designed for Medium with:
- 6-12 minute read times
- Code blocks with syntax highlighting
- Mermaid diagrams for architecture visualization

## License

MIT License - see [LICENSE](LICENSE) file.

## Author

**Marouan Chakran**

- Website: [marouan.net](https://marouan.net)
- GitHub: [@Marouan-chak](https://github.com/Marouan-chak)
- Email: [contact@marouan.net](mailto:contact@marouan.net)

## Links

- [Crossplane Documentation](https://docs.crossplane.io/)
- [Python Function SDK](https://github.com/crossplane/function-sdk-python)
- [Companion Code Repository](https://github.com/Marouan-chak/crossplane-python-blog-series)
