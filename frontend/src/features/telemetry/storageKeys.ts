/**
 * Every localStorage key telemetry owns, in one place: revoking consent must
 * wipe all of them except the consent itself, so the list is the contract.
 */
export const CONSENT_KEY = 'torollo_telemetry_consent';
export const INSTALL_ID_KEY = 'torollo_telemetry_install_id';
export const MILESTONES_KEY = 'torollo_telemetry_milestones';
