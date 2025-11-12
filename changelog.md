# Changelog

## Version 3.1.1 (2025-11-12)

### Bug Fixes

- fixed loading config, now uses also command line argument, before only environment variable was used
- removed `help` from `IHelpObject` interface, because it was not used

## Version 3.1.0 (2025-11-11)

### Features

- new `processEnvCfg` function, that reads configuration from ENV variables
- new `processCfgFile` function, that reads configuration from config file

## Version 3.0.0 (2025-11-11)

### BREAKING CHANGES

- updated to es module package
- `command-line-args` and `command-line-usage` replaced with `yargs`
- removed dependency on `extend` and `moment`
- updated verson on dependency `cross-env` to minimal `10.1.0` 
- updated verson on dependency `simple-git` to minimal `3.30.0` 
- updated verson on dependency `semver` to minimal `7.7.3`
- updated output to `es2022` version
