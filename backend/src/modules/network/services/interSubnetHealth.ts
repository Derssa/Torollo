/**
 * Per-project result of the real inter-subnet connectivity self-test run by
 * the network provider after applying a plan (see
 * `DockerNetworkProvider.probeInterSubnetConnectivity`).
 *
 * - `ok`: a real TCP probe crossed two subnet networks on this host.
 * - `blocked`: the probe could not cross — the host firewall/Docker setup
 *   drops forwarded traffic between subnet bridges, so ALLOW rules between
 *   subnets cannot work no matter what the learner configures.
 * - `unknown`: the probe itself could not run (never reported as a failure
 *   to the learner — only a confirmed `blocked` downgrades validations).
 *
 * Lives in its own module (not `NetworkService`) so the provider can record
 * results without importing the service that instantiates it.
 */
export type InterSubnetStatus = 'ok' | 'blocked' | 'unknown';

const statusByProject: Record<string, InterSubnetStatus> = {};

export function getInterSubnetStatus(projectId: string): InterSubnetStatus {
  return statusByProject[projectId] ?? 'unknown';
}

export function setInterSubnetStatus(projectId: string, status: InterSubnetStatus): void {
  statusByProject[projectId] = status;
}

export function clearInterSubnetStatus(projectId: string): void {
  delete statusByProject[projectId];
}
