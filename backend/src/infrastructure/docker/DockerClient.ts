import Docker from 'dockerode';
import { ENV } from '../../config/env';

const docker = new Docker({ socketPath: ENV.DOCKER_SOCKET });

export default docker;
