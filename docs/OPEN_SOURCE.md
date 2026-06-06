# Open Source Publishing Checklist

Use this checklist before making the repository public.

## Repository Contents

- [ ] Confirm `workspace/`, generated builds, logs, `.env` files, and local test
      output are not tracked.
- [ ] Run the secret/private-data scans below.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Confirm `README.md`, `LICENSE`, `CONTRIBUTING.md`, and `SECURITY.md` are
      present and current.

## Secret and Private-Data Scan

Current tracked files:

```bash
git grep -n -I -E '(api[_-]?key|secret|token|password|private[_-]?key|BEGIN .*PRIVATE|AWS_|GITHUB_TOKEN|OPENAI_API_KEY)'
```

Full Git history:

```bash
git rev-list --all |
while read rev; do
  git grep -n -I -E '(api[_-]?key|secret|token|password|private[_-]?key|BEGIN .*PRIVATE|AWS_|GITHUB_TOKEN|OPENAI_API_KEY)' "$rev" || true
done
```

History file audit:

```bash
for rev in $(git rev-list --all); do
  git ls-tree -r --name-only "$rev" |
    rg '^(workspace|output|\\.env)|\\.(pem|key|p12|mobileprovision|cer|crt)$' || true
done
```

## Git History

If private workspace files were ever committed, remove them before making the
repository public. A safer publishing path is to create a new public repository
from the current clean tree, or to rewrite history and force-push only after all
collaborators know that commit SHAs will change.

Recommended history rewrite tool:

```bash
git filter-repo --path workspace/ --path skills/ --invert-paths
```

After rewriting, re-run the scans above before publishing.
