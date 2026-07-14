import { ValidatorHandler } from './types';
import { containerRunning } from './validators/containerRunning';

/**
 * The single extension point for validator types: adding a type to the
 * roadmap palette means adding a file under validators/ and one entry here
 * (see docs/learning-api.md, "Adding a validator type").
 */
export const validatorRegistry: Readonly<Record<string, ValidatorHandler>> = {
  container_running: containerRunning,
};
