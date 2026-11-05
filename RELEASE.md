# Making a new release of jupyter_chat_codemirror

## Private GitHub release (current supported path)

The repository's default workflow publishes versioned **GitHub Release assets
only**, with no PyPI or npm publication. Keep `package.json` at the currently
released source version until running Step 1; do not pre-bump it.

1. From `main`, run **Step 1: Prep Release** with the desired *higher*
   `version_spec` (for example `0.1.2` from `0.1.1`). This bumps the
   version in the release checkout, generates the changelog and creates a
   **draft** GitHub release. It needs `contents: write`, `issues: read`
   and `pull-requests: read` permissions for private-repository changelog
   generation.
2. Review the draft release. Run **Step 2: Publish Release** on `main`,
   entering the draft release URL exactly. With
   `PUBLIC_RELEASES_ENABLED` unset or false, the private job verifies
   `package.json` remains private, uses Jupyter Releaser to build and
   validate artifacts, record their SHA-256 hashes, create the release
   commit/tag, and upload them to GitHub; it requires the versioned Python
   wheel and `asset_shas.json` before making the GitHub release non-draft.
   **This step commits/tags and publishes assets to the private GitHub
   repository; it does not publish to package registries.** Do not use
   `steps_to_skip` in this path.
3. Confirm the wheel and hash manifest under the GitHub release and capture
   its exact source commit, wheel digest and version for the consuming
   application's separate artifact review and integration.

The private workflow uses the repository's `release` environment (which may
require reviewer approval), normal `GITHUB_TOKEN` permissions and existing
Jupyter Releaser tooling. No publication credentials or public-release
variable are needed. If branch rules prohibit the releaser's commit/tag push,
report the failed authorization rather than bypassing the rule or enabling
public publishing. Do not rerun Step 1 against an already-bumped source
version: Hatch requires a strictly higher version.

The original **Step 2** public job remains guarded by
`PUBLIC_RELEASES_ENABLED == 'true'` and must not be enabled without a
separate public-publication decision.


> **Private incubation:** Public PyPI/npm publishing is not authorized. `package.json` uses `private: true`. The standard Step 2 workflow has a GitHub-only path while `PUBLIC_RELEASES_ENABLED` is unset or false; its public-registry path is guarded by `PUBLIC_RELEASES_ENABLED == 'true'`. Do not enable that variable or configure public release credentials without a separate decision.

Only after separate authorization may the extension be published to `PyPI` and `npm` manually or using the [Jupyter Releaser](https://github.com/jupyter-server/jupyter_releaser).

The procedures below describe optional public publication and do not supersede the private GitHub release procedure above. Consumer-specific
image composition, activation and recovery belong to the consuming project.
Building or installing the extension establishes only that artifact/environment;
report browser and downstream validation separately.

## Manual release

### Python package

This extension can be distributed as Python packages. All of the Python
packaging instructions are in the `pyproject.toml` file to wrap your extension in a
Python package. Before generating a package, you first need to install some tools:

```bash
pip install build twine hatch
```

Bump the version using `hatch`. By default this will create a tag.
See the docs on [hatch-nodejs-version](https://github.com/agoose77/hatch-nodejs-version#semver) for details.

```bash
hatch version <new-version>
```

Make sure to clean up all the development files before building the package:

```bash
jlpm clean:all
```

You could also clean up the local git repository:

```bash
git clean -dfX
```

To create a Python source package (`.tar.gz`) and the binary package (`.whl`) in the `dist/` directory, do:

```bash
python -m build
```

> `python setup.py sdist bdist_wheel` is deprecated and will not work for this package.

Then to upload the package to PyPI, do:

```bash
twine upload dist/*
```

### NPM package

To publish the frontend part of the extension as a NPM package, do:

```bash
npm login
npm publish --access public
```

## Automated releases with the Jupyter Releaser

The extension repository should already be compatible with the Jupyter Releaser. But
the GitHub repository and the package managers need to be properly set up. Please
follow the instructions of the Jupyter Releaser [checklist](https://jupyter-releaser.readthedocs.io/en/latest/how_to_guides/convert_repo_from_repo.html).

For the release workflows in this repository, make sure GitHub is configured with:

- a `release` environment
- an `APP_PRIVATE_KEY` secret
- an `APP_ID` repository variable

When using [npm trusted publishing](https://docs.npmjs.com/trusted-publishers), `NPM_TOKEN` is not required (and trusted publishing is recommended). Configure `NPM_TOKEN` only if you are publishing without trusted publishers.

For private releases, use the Step 1 and Step 2 process above. Public publication remains separately guarded. The public sequence, if explicitly authorized, is:

- Go to the Actions panel
- Run the "Step 1: Prep Release" workflow
- Check the draft changelog
- Run the "Step 2: Publish Release" workflow

> [!NOTE]
> Check out the [workflow documentation](https://jupyter-releaser.readthedocs.io/en/latest/get_started/making_release_from_repo.html)
> for more information.

## Publishing to `conda-forge`

If the package is not on conda forge yet, check the documentation to learn how to add it: https://conda-forge.org/docs/maintainer/adding_pkgs.html

Otherwise a bot should pick up the new version publish to PyPI, and open a new PR on the feedstock repository automatically.
