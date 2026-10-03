# Making a new release of jupyter_chat_codemirror

> **Private incubation:** public PyPI/npm publishing is not currently authorized. `package.json` uses `private: true`; `.github/workflows/publish-release.yml` also skips its publish job unless the repository variable `PUBLIC_RELEASES_ENABLED` is explicitly set to `true`. Do not set that variable or configure release credentials without a later publication decision.

After explicit authorization and removal of that safeguard, the extension can be published to `PyPI` and `npm` manually or using the [Jupyter Releaser](https://github.com/jupyter-server/jupyter_releaser).

For maintained Beauty-system work, [AGENTS.md](AGENTS.md) routes to the canonical
release-stage, evidence, and upgrade-completeness policy. The guarded procedures
here remain the operational publication paths; policy synchronization grants no
permission to enable public releases, configure credentials, publish, or deploy.

## Downstream integration and recovery handoff

Building and installing this extension proves only that artifact/environment.
It does not prove the extension is composed into a running Beauty/Tink image.
Record the exact artifact or source identity, compatible JupyterLab/Jupyter Chat
factory API, required consumer image/configuration/activation changes, regression
evidence, and known-good recovery artifact in the issue/PR. Hand off required
transitions to the owning image/deployment mechanism and identify unsupported
steps; do not invent a second release or deployment system here.

Keep offline/build, installed-extension, browser, and live downstream evidence
distinct. Pending post-release `v0.x` evaluation alone does not block a complete
PR from review. Recovery needs a compatible prior artifact/image and
configuration/state; an older wheel alone does not reverse an incompatible
consumer transition. Coordinated upgrades and signaling remain separate work.

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

Here is a summary of the steps to cut a new release:

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
