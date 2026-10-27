import packageInfo from '../package.json' with {type:'json'};

/** Public beta label; package.json.version remains valid npm SemVer. */
export const RELEASE_VERSION = packageInfo.releaseVersion;
