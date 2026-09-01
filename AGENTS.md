## Git and Feature Development Workflow

TestPilot must be developed incrementally using real feature branches and meaningful commits.

### Branching

* `main` is the stable branch.
* Never implement a feature directly on `main`.
* Every distinct feature, bug fix, refactor, test improvement, or infrastructure change must use its own branch.
* Branch names should follow:

  `feature/<short-description>`

  `fix/<short-description>`

  `refactor/<short-description>`

  `test/<short-description>`

  `infra/<short-description>`

### Feature workflow

For every feature:

1. Start from the latest `main`.
2. Create an appropriate feature branch.
3. Implement the feature incrementally.
4. Run relevant tests after each meaningful change.
5. Make small, focused commits.
6. Push the branch to GitHub.
7. Verify the branch is clean and tests pass.
8. Merge the completed branch into `main`.
9. Switch back to `main`.
10. Pull the merged changes.
11. Begin the next feature from the updated `main`.

### Commit rules

Commits must represent real, meaningful development work.

Good examples:

* `feat: add CSV upload validation`
* `feat: implement deterministic type inference`
* `feat: add missing value profiling`
* `feat: calculate duplicate row statistics`
* `feat: add IQR outlier detection`
* `feat: implement health score calculation`
* `test: add profiler fixture coverage`
* `fix: handle empty CSV headers`
* `refactor: isolate profiling rules`
* `docs: document health score rules`

Do not create empty, meaningless, duplicate, or artificially padded commits.

Do not backdate commits or modify timestamps to make development appear older than it is.

Do not squash meaningful feature commits merely to reduce the visible history.

### Branch completion

Before merging a feature:

* Run the relevant automated tests.
* Run lint/type checks where applicable.
* Verify the feature manually when appropriate.
* Review the changed files.
* Confirm there are no unrelated changes.
* Confirm the branch is based on the latest `main`.

### Merge policy

Completed feature branches should be merged into `main` as their own logical units.

Prefer preserving meaningful commit history so the repository shows how the product was actually developed.

### Scope control

Do not combine unrelated features into one branch.

If a task naturally contains multiple independent pieces, split them into separate branches when practical.

Do not start the next feature until the current feature has been tested and merged.

### Important

The Git history must accurately represent the actual development process.

The goal is a clean, professional, traceable engineering history—not artificially inflated activity.
