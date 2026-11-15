import sdk from '../packages/sdk/package.json';

export const sdkVersion = sdk.version;
export const sdkArchiveFilename = `plyli-sdk-${sdkVersion}.tgz`;
export const sdkArchivePath = `/downloads/${sdkArchiveFilename}`;
export const privateProvisioningSdkNotice = 'Private provisioning requires SDK 0.3.0 or later and a Plyli server running 0.3.0 or later. If pnpm installs an earlier SDK, use the instance archive below.';
