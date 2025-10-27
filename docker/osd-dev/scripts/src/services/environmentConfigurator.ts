import { existsSync, readFileSync } from 'fs';
import {
  DEFAULTS,
  PROFILES,
  OSD_MAJOR_2X,
  OSD_MAJOR_1X,
  SECURITY_CONFIG_PATHS,
  FLAGS,
} from '../constants/app';
import { EnvironmentPaths, ScriptConfig } from '../types/config';
import { ValidationError } from '../errors';
import {
  MSG_SERVER_LOCAL_MODE_REQUIRES_VERSION,
  MSG_SERVER_MODE_REQUIRES_VERSION,
  msgUnsupportedModeToken,
} from '../constants/messages';

export function initializeBaseEnvironment(config: ScriptConfig): void {
  process.env.PASSWORD = process.env.PASSWORD || DEFAULTS.defaultPassword;
  process.env.OS_VERSION = config.osVersion;
  process.env.OSD_VERSION = config.osdVersion;
  process.env.OSD_PORT = process.env.PORT || DEFAULTS.osdPort;
  process.env.IMPOSTER_VERSION = DEFAULTS.imposterVersion;
  // Use host path for compose variables (not container alias)
  process.env.SRC = config.pluginsRoot || '';
}

export function setVersionDerivedEnvironment(
  osdVersion: string,
  envPaths: EnvironmentPaths,
): void {
  const osdMajorNumber = parseInt(osdVersion.split('.')[0], 10);
  process.env.OSD_MAJOR_NUMBER = osdMajorNumber.toString();
  process.env.COMPOSE_PROJECT_NAME = `os-dev-${osdVersion.replace(/\./g, '')}`;
  process.env.WAZUH_STACK = process.env.WAZUH_STACK || '';

  if (existsSync(envPaths.packageJsonPath)) {
    const packageJson = JSON.parse(
      readFileSync(envPaths.packageJsonPath, 'utf-8'),
    );
    process.env.WAZUH_VERSION_DEVELOPMENT = packageJson.version;
  }

  // Always target OSD 2.x for development scripts.
  process.env.OSD_MAJOR = OSD_MAJOR_2X;
}

export function configureModeAndSecurity(config: ScriptConfig): string {
  // Defaults for standard mode
  let primaryProfile = PROFILES.STANDARD;

  // Fixed to OSD 2.x configuration
  const osdMajor = OSD_MAJOR_2X;
  process.env.WAZUH_DASHBOARD_CONF = `./config/${osdMajor}/osd/opensearch_dashboards.yml`;
  process.env.SEC_CONFIG_FILE = `./config/${osdMajor}/os/config.yml`;
  process.env.SEC_CONFIG_PATH = SECURITY_CONFIG_PATHS[OSD_MAJOR_2X];

  const enableSaml =
    Boolean(config.enableSaml) || config.mode === PROFILES.SAML;

  if (enableSaml) {
    // Assume environment/network is preconfigured for SAML.
    process.env.WAZUH_DASHBOARD_CONF = `./config/${osdMajor}/osd/opensearch_dashboards_saml.yml`;
    process.env.SEC_CONFIG_FILE = `./config/${osdMajor}/os/config-saml.yml`;
  }

  // Determine primary profile based on explicit server/server-local first (flags take precedence via parser)
  // Reject direct server-local-* composite modes; users must set -a together with FLAGS.SERVER_LOCAL
  if (new RegExp(`^${PROFILES.SERVER_LOCAL}-`).test(config.mode)) {
    throw new ValidationError(msgUnsupportedModeToken());
  }

  if (config.mode === PROFILES.SERVER) {
    if (!config.modeVersion) {
      throw new ValidationError(MSG_SERVER_MODE_REQUIRES_VERSION);
    }
    process.env.WAZUH_STACK = config.modeVersion;
    return PROFILES.SERVER;
  }

  if (config.mode === PROFILES.SERVER_LOCAL) {
    if (!config.modeVersion) {
      throw new ValidationError(MSG_SERVER_LOCAL_MODE_REQUIRES_VERSION);
    }
    process.env.IMAGE_TAG = config.modeVersion;
    return config.agentsUp
      ? `${PROFILES.SERVER_LOCAL}-${config.agentsUp}`
      : PROFILES.SERVER_LOCAL;
  }

  if (config.mode === PROFILES.SAML) {
    return PROFILES.SAML;
  }

  return primaryProfile;
}
