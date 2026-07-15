import { ValidatorHandler } from './types';
import { containerRunning } from './validators/containerRunning';
import { tableExists } from './validators/tableExists';
import { redisKeyExists } from './validators/redisKeyExists';
import { mongoCollectionExists } from './validators/mongoCollectionExists';
import { edgeExists } from './validators/edgeExists';
import { lbUpstreams } from './validators/lbUpstreams';
import { portDenied } from './validators/portDenied';
import { asgReplicas } from './validators/asgReplicas';

/**
 * The single extension point for validator types: adding a type to the
 * roadmap palette means adding a file under validators/ and one entry here
 * (see docs/learning-api.md, "Adding a validator type").
 */
export const validatorRegistry: Readonly<Record<string, ValidatorHandler>> = {
  container_running: containerRunning,
  table_exists: tableExists,
  redis_key_exists: redisKeyExists,
  mongo_collection_exists: mongoCollectionExists,
  edge_exists: edgeExists,
  lb_upstreams: lbUpstreams,
  port_denied: portDenied,
  asg_replicas: asgReplicas,
};
