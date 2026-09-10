# Engineering

Classora values intentional, boring, maintainable code.

## Priorities

Optimize for:

1. correctness
2. security
3. tenant isolation
4. simplicity
5. readability
6. smallest coherent diff

Do not optimize for architectural sophistication.

## Scope

Inspect existing code before introducing a new pattern.

Reuse existing implementation when appropriate.

Do not:

- refactor unrelated code
- create abstractions for hypothetical requirements
- create wrappers that add no behavior
- split functions/components solely to reduce line count
- add dependencies for trivial functionality
- add fallback behavior that hides configuration or programming errors
- add explanatory comments for obvious code
- introduce competing patterns for problems already solved in the repo

Do not generate code merely because a task sounds like it might need it.

Security, accessibility, data integrity and tenant isolation are never sacrificed for fewer lines.
