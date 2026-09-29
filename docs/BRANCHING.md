# Branching policy

`main` is the single source of truth for the current runnable product.

## Rules

1. Start new implementation branches from the latest `origin/main`.
2. Product-ready UI changes must return to `main` promptly through a pull request. Do not keep accepted product work only on long-lived `design/*` branches.
3. Before starting substantial work, check active branches for divergence:
   ```bash
   git fetch origin
   git branch -r
   git log --all --graph --decorate --oneline -30
   git rev-list --left-right --count origin/main...origin/<branch>
   ```
4. If another branch is materially ahead of `main`, reconcile it first instead of assuming `main` represents the latest product.
5. Pull requests to `main` must pass CI: typecheck, tests, and production build.
6. After a product branch is merged, delete or archive it rather than continuing product development on the old branch.

## Working definition of “latest”

“Latest” means the newest product state that is merged into `main`, not simply the branch with the newest timestamp or the most recent local edits.
