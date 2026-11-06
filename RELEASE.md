# Making a new release of jupyter_chat_codemirror

## Private GitHub release (normal workflow)

During private incubation, releases go to GitHub only; do not enable public PyPI or npm publication. Keep `package.json` at the current source version until preparing the next release.

1. Run **Step 1: Prep Release** on `main` with a higher version, such as `0.1.2` from `0.1.1`. Review the changelog and draft GitHub release.
2. Run **Step 2: Publish Release** on `main` with the draft release URL shown by GitHub. Draft URLs normally end in `untagged-...` until the tag is pushed. The workflow removes query parameters from copied links, verifies the draft directly against GitHub, and reads its actual version tag. When `PUBLIC_RELEASES_ENABLED` is unset or false, it builds and checks the distributions, creates the release commit and tag, uploads the wheel and SHA-256 manifest, and publishes only the GitHub release. No PyPI/npm publishing runs.
3. Record the wheel's checksum and source commit for the consuming project's separate validation and deployment.

This path uses the existing `release` environment and GitHub repository permissions. The preparation job needs issue and pull-request read access to generate the changelog. Report any branch-protection or authorization failure rather than bypassing it.

The public publishing job remains gated on `PUBLIC_RELEASES_ENABLED == 'true'` and requires separate authorization.

> **Private incubation:** Public PyPI/npm publishing is not authorized. `package.json` remains `private: true`. The GitHub-only workflow does not require registry publishing credentials.

With separate authorization, the extension may be published to `PyPI` and `npm` manually or using the [Jupyter Releaser](https://github.com/jupyter-server/jupyter_releaser).

The procedures below describe optional public publication. Consumer-specific image composition, activation and recovery belong to the consuming project.
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

For public publication only, after separate approval, the sequence is:

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
